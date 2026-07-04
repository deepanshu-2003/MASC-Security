import sys
import json
import os
import math

try:
    import numpy as np
    from sklearn.ensemble import IsolationForest, RandomForestClassifier
    from sklearn.metrics import confusion_matrix, accuracy_score, precision_recall_fscore_support
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

# File path to store trained weights
WEIGHTS_FILE = os.path.join(os.path.dirname(__file__), "trained_model.json")

def train_model():
    if not SKLEARN_AVAILABLE:
        print(json.dumps({
            "error": "scikit-learn or numpy is not installed in the virtual environment."
        }))
        return

    try:
        # Read training JSON dataset from standard input
        input_data = sys.stdin.read()
        if not input_data.strip():
            print(json.dumps({"error": "Empty training dataset"}))
            return

        payload = json.loads(input_data)
        dataset = payload.get("dataset", [])
        
        if len(dataset) < 20:
            print(json.dumps({"error": "Insufficient training dataset size (need at least 20 samples)"}))
            return

        feature_keys = [
            "device_secure", "network_secure", "is_public_network",
            "device_known", "vpn_active", "ip_changed", "ua_changed"
        ]

        # Vectorize features
        X = []
        y = []
        for sample in dataset:
            vector = []
            for key in feature_keys:
                val = sample.get(key, False)
                # Map secure states: unsecure = 1.0, secure = 0.0
                if key in ["device_secure", "network_secure", "device_known"]:
                    vector.append(0.0 if val else 1.0)
                else:
                    vector.append(1.0 if val else 0.0)
            X.append(vector)
            y.append(1 if sample.get("label", 0) == 1 else 0)

        X = np.array(X)
        y = np.array(y)

        # 1. Train Unsupervised Outlier Detector (Isolation Forest on normal data)
        X_normal = X[y == 0]
        if len(X_normal) < 5:
            # Fallback to all data if normal logs are sparse
            X_normal = X
            
        iso_forest = IsolationForest(n_estimators=50, contamination=0.1, random_state=42)
        iso_forest.fit(X_normal)

        # 2. Train Supervised Classifier (Random Forest Classifier for exact probabilities)
        rf_classifier = RandomForestClassifier(n_estimators=30, max_depth=4, random_state=42)
        rf_classifier.fit(X, y)

        # 3. Calculate Predictions and Metrics
        y_pred = rf_classifier.predict(X)
        
        accuracy = float(accuracy_score(y, y_pred))
        precision, recall, f1, _ = precision_recall_fscore_support(y, y_pred, average="binary", zero_division=0)
        
        # Confusion Matrix
        tn, fp, fn, tp = confusion_matrix(y, y_pred, labels=[0, 1]).ravel()

        # Feature Importances
        importances = rf_classifier.feature_importances_
        feature_importance_dict = {key: float(imp) for key, imp in zip(feature_keys, importances)}

        # Extract baseline centroid from normal logs for distance calculations
        centroid = X_normal.mean(axis=0).tolist() if len(X_normal) > 0 else [0.0] * len(feature_keys)

        # 4. Serialize model configuration parameters
        model_payload = {
            "trained": True,
            "trained_at": os.path.getmtime(WEIGHTS_FILE) if os.path.exists(WEIGHTS_FILE) else None,
            "sample_size": len(dataset),
            "metrics": {
                "accuracy": accuracy,
                "precision": float(precision),
                "recall": float(recall),
                "f1_score": float(f1),
                "confusion_matrix": {
                    "tn": int(tn),
                    "fp": int(fp),
                    "fn": int(fn),
                    "tp": int(tp)
                }
            },
            "feature_importance": feature_importance_dict,
            "baseline_centroid": centroid
        }

        # Write model parameters to file
        with open(WEIGHTS_FILE, "w") as f:
            json.dump(model_payload, f, indent=2)

        # Return results to Node.js stdout
        print(json.dumps({
            "success": True,
            "summary": model_payload
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    train_model()
