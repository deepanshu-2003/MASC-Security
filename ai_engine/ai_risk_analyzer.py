import sys
import json
import math
import os

SKLEARN_AVAILABLE = None
IsolationForest = None
np = None

def check_sklearn():
    global SKLEARN_AVAILABLE, IsolationForest, np
    if SKLEARN_AVAILABLE is not None:
        return SKLEARN_AVAILABLE
    try:
        from sklearn.ensemble import IsolationForest as IF
        import numpy as NUMP
        IsolationForest = IF
        np = NUMP
        SKLEARN_AVAILABLE = True
    except ImportError:
        SKLEARN_AVAILABLE = False
    return SKLEARN_AVAILABLE

class NaiveBayesThreatClassifier:
    """
    Implements a Naive Bayes probabilistic model to estimate P(Threat | Telemetry).
    """
    def __init__(self):
        # Prior probability of a threat occurring (baseline P(Threat) vs P(Safe))
        self.p_threat = 0.05
        self.p_safe = 0.95
        
        # Conditional probability tables: P(Feature = True | Threat) vs P(Feature = True | Safe)
        # Parameters estimated from cybersecurity compromise benchmarks
        self.conditional_probs = {
            "vpn_active":       {"threat": 0.75, "safe": 0.08},
            "device_unsecure":  {"threat": 0.85, "safe": 0.05},
            "network_unsecure": {"threat": 0.80, "safe": 0.04},
            "public_network":   {"threat": 0.60, "safe": 0.12},
            "device_unrecognized": {"threat": 0.80, "safe": 0.06},
            "ip_changed":       {"threat": 0.90, "safe": 0.10},
            "ua_changed":       {"threat": 0.85, "safe": 0.08}
        }

    def predict_threat_probability(self, features):
        """
        Calculates the posterior probability P(Threat | features) using Naive Bayes theorem.
        """
        # Start with log priors to avoid underflow
        log_p_threat_cond = math.log(self.p_threat)
        log_p_safe_cond = math.log(self.p_safe)
        
        for feature_name, value in features.items():
            if feature_name in self.conditional_probs:
                p_f_threat = self.conditional_probs[feature_name]["threat"]
                p_f_safe = self.conditional_probs[feature_name]["safe"]
                
                # If feature is false, compute 1 - p
                if not value:
                    p_f_threat = 1.0 - p_f_threat
                    p_f_safe = 1.0 - p_f_safe
                
                # Apply Laplace smoothing to avoid zero probability multiplications
                p_f_threat = max(0.0001, min(0.9999, p_f_threat))
                p_f_safe = max(0.0001, min(0.9999, p_f_safe))
                
                log_p_threat_cond += math.log(p_f_threat)
                log_p_safe_cond += math.log(p_f_safe)
                
        # Exponentiate logs to get probability ratios
        max_log = max(log_p_threat_cond, log_p_safe_cond)
        p_threat_exp = math.exp(log_p_threat_cond - max_log)
        p_safe_exp = math.exp(log_p_safe_cond - max_log)
        
        posterior_prob = p_threat_exp / (p_threat_exp + p_safe_exp)
        return posterior_prob


class AnomalyDetector:
    """
    Evaluates context outliers relative to historical normal logins.
    Uses scikit-learn IsolationForest if available, falling back to a pure-python
    Euclidean Centroid Distance model otherwise.
    """
    def __init__(self, history):
        self.history = history
        self.feature_keys = [
            "device_secure", "network_secure", "is_public_network",
            "device_known", "vpn_active", "ip_changed", "ua_changed"
        ]

    def _vectorize(self, log):
        """Helper to map JSON objects into float feature vectors"""
        vector = []
        for key in self.feature_keys:
            val = log.get(key, False)
            # Normalize boolean state: true = 1.0, false = 0.0
            # For secure state inverted mapping: unsecure = 1.0, secure = 0.0
            if key in ["device_secure", "network_secure", "device_known"]:
                vector.append(0.0 if val else 1.0)
            else:
                vector.append(1.0 if val else 0.0)
        return vector

    def get_anomaly_score(self, current_log):
        current_vector = self._vectorize(current_log)
        
        trained_history = self.history
        if not trained_history or len(trained_history) < 5:
            # Attempt loading pre-trained baseline centroid
            weights_path = os.path.join(os.path.dirname(__file__), "trained_model.json")
            if os.path.exists(weights_path):
                try:
                    with open(weights_path, "r") as f:
                        w_data = json.load(f)
                    centroid = w_data.get("baseline_centroid")
                    if centroid:
                        trained_history = []
                        # Generate simulated logs matching the baseline model centroid
                        for _ in range(15):
                            sim_log = {}
                            for idx, f_key in enumerate(self.feature_keys):
                                threshold = centroid[idx]
                                if f_key in ["device_secure", "network_secure", "device_known"]:
                                    sim_log[f_key] = False if threshold > 0.5 else True
                                else:
                                    sim_log[f_key] = True if threshold > 0.5 else False
                            trained_history.append(sim_log)
                except Exception:
                    pass

        if not trained_history or len(trained_history) < 5:
            # Insufficient history - return neutral baseline
            return 0.3334

        if check_sklearn():
            try:
                X_train = np.array([self._vectorize(h) for h in trained_history])
                # Instantiate and fit Isolation Forest anomaly detector
                model = IsolationForest(n_estimators=30, contamination=0.1, random_state=42)
                model.fit(X_train)
                
                # score_samples outputs negative anomaly scores (more negative = anomalous)
                raw_score = model.score_samples([current_vector])[0]
                # Normalize raw score from [-1, 0] to [0.0 (normal), 1.0 (anomalous)]
                anomaly_score = max(0.0, min(1.0, (raw_score - (-0.8)) / (-0.35)))
                return anomaly_score
            except Exception as e:
                # Fall through to distance fallback on error
                pass

        # PURE-PYTHON DISTANCE BASED ANOMALY DETECTION FALLBACK
        # Compute mean feature vector of normal baseline profile
        history_vectors = [self._vectorize(h) for h in trained_history]
        num_features = len(self.feature_keys)
        mean_vector = [0.0] * num_features
        for vec in history_vectors:
            for i in range(num_features):
                mean_vector[i] += vec[i]
        mean_vector = [x / len(history_vectors) for x in mean_vector]
        
        # Calculate Euclidean distance of current login vector from user's historical centroid
        squared_diff = 0.0
        for i in range(num_features):
            squared_diff += (current_vector[i] - mean_vector[i]) ** 2
        distance = math.sqrt(squared_diff)
        
        # Normalize distance relative to feature space diagonal size
        max_dist = math.sqrt(num_features)
        anomaly_score = distance / max_dist
        return anomaly_score


def analyze_risk():
    try:
        # Read JSON parameters from standard input
        input_data = sys.stdin.read()
        if not input_data.strip():
            return {"error": "Empty input telemetry"}
        
        event = json.loads(input_data)
        
        action = event.get("action")
        email = event.get("email", "")
        ip = event.get("ip", "")
        userAgent = event.get("userAgent", "")
        
        failed_login_count = event.get("failed_login_count", 0)
        denied_route_count = event.get("denied_route_count", 0)
        active_sessions_count = event.get("active_sessions_count", 0)
        
        ip_changed = event.get("ip_changed", False)
        ua_changed = event.get("ua_changed", False)
        resource = event.get("resource", "")

        # Target telemetry values
        device_secure = event.get("device_secure", True)
        network_secure = event.get("network_secure", True)
        is_public_network = event.get("is_public_network", False)
        device_known = event.get("device_known", True)
        vpn_active = event.get("vpn_active", False)
        history = event.get("history", [])

        # --- MODEL A: Probabilistic Naive Bayes Inference ---
        nb_features = {
            "vpn_active": vpn_active,
            "device_unsecure": not device_secure,
            "network_unsecure": not network_secure,
            "public_network": is_public_network,
            "device_unrecognized": not device_known,
            "ip_changed": ip_changed,
            "ua_changed": ua_changed
        }
        nb_model = NaiveBayesThreatClassifier()
        nb_threat_prob = nb_model.predict_threat_probability(nb_features)

        # --- MODEL B: Context Outlier Anomaly Detection ---
        ad_model = AnomalyDetector(history)
        anomaly_score = ad_model.get_anomaly_score(event)

        # --- MODEL C: Heuristics Override (Deterministic Safeguards) ---
        override_score = 0
        override_reason = ""
        
        if failed_login_count >= 5:
            override_score = 90
            override_reason = f"High frequency of recent failed logins ({failed_login_count})"
        elif failed_login_count >= 3:
            override_score = 55
            override_reason = f"Repeated recent failed logins ({failed_login_count})"
        elif action == 'ACCESS_DENIED' and denied_route_count >= 4:
            override_score = 75
            override_reason = f"Frequent unauthorized route access scraping ({denied_route_count})"
        elif action == 'SESSION_HIJACK_DETECTED':
            override_score = 95
            override_reason = "Critical Session parameter mismatch during validation check."

        # --- ENSEMBLE WEAVER (Decision Fusion) ---
        # 40% Naive Bayes probability + 60% Outlier Anomaly Score
        ensemble_score = (0.4 * nb_threat_prob) + (0.6 * anomaly_score)
        
        # Convert floating range [0.0, 1.0] to integer score [0, 100]
        final_score = int(ensemble_score * 100)
        
        # Overlay heuristics overrides if they exceed the calculated risk
        if override_score > final_score:
            final_score = override_score
            ai_description = f"Determined threat index via heuristic safeguard: {override_reason}."
        else:
            ai_description = (
                f"Analysed risk score via ensemble fusion. "
                f"Probabilistic Threat Index: {int(nb_threat_prob*100)}%. "
                f"Context Outlier Index: {int(anomaly_score*100)}%."
            )

        # Apply secondary telemetry warnings to descriptive string
        telemetry_flags = []
        if not device_secure: telemetry_flags.append("Unsecure Device")
        if not network_secure: telemetry_flags.append("Unsecure Network")
        if is_public_network: telemetry_flags.append("Public WiFi")
        if vpn_active: telemetry_flags.append("VPN Detected")
        if not device_known: telemetry_flags.append("Unrecognized Device")
        
        if telemetry_flags:
            ai_description += " Threat Telemetry Flags: " + ", ".join(telemetry_flags) + "."

        # Classify threat severity matching the admin UI risk bands:
        #   Score  0–34  → 'safe'     (Low Risk)
        #   Score 35–74  → 'moderate' (Medium Risk — triggers mediumRiskPolicy)
        #   Score 75–100 → 'critical' (High Risk  — triggers highRiskPolicy)
        severity = 'safe'
        recommendation = 'No immediate action required.'
        
        if final_score >= 75:
            severity = 'critical'
            recommendation = 'Critical Threat: Enforce immediate access block or terminate active sessions.'
        elif final_score >= 35:
            severity = 'moderate'
            recommendation = 'Moderate Risk: Request multi-factor OTP verification challenge.'

        return {
            "score": final_score,
            "severity": severity,
            "description": ai_description,
            "recommendation": recommendation
        }

    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    result = analyze_risk()
    print(json.dumps(result))
