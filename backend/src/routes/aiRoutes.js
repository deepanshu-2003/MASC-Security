import express from 'express';
import { protectAdmin } from '../middlewares/authMiddleware.js';
import AiEvent from '../models/AiEvent.js';
import { getAiPlatformRecommendations, runModelTraining } from '../services/aiService.js';

const router = express.Router();

// GET /api/v1/ai/summary
// Retrieves average platform risk score and count of pending anomalies.
router.get('/summary', protectAdmin, async (req, res, next) => {
  try {
    const pendingEvents = await AiEvent.find({ status: 'pending' });
    
    let totalScore = 0;
    let criticalCount = 0;
    let suspiciousCount = 0;
    let moderateCount = 0;
    let safeCount = 0;

    pendingEvents.forEach(event => {
      totalScore += event.score;
      if (event.severity === 'critical') criticalCount++;
      else if (event.severity === 'suspicious') suspiciousCount++;
      else if (event.severity === 'moderate') moderateCount++;
      else safeCount++;
    });

    const averageRiskScore = pendingEvents.length > 0 
      ? Math.round(totalScore / pendingEvents.length) 
      : 0;

    res.json({
      platformRiskScore: averageRiskScore,
      unresolvedCount: pendingEvents.length,
      criticalCount,
      suspiciousCount,
      moderateCount,
      safeCount
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/ai/alerts
// Retrieves list of AI observations and alerts.
router.get('/alerts', protectAdmin, async (req, res, next) => {
  try {
    const alerts = await AiEvent.find().sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/ai/alerts/:id
// Resolve or dismiss an alert.
router.put('/alerts/:id', protectAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['pending', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status update' });
    }

    const alert = await AiEvent.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'Alert not found' });
    }

    alert.status = status;
    await alert.save();
    res.json(alert);
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/ai/recommendations
// Retrieves platform-wide AI security suggestions (uses Gemini or fallbacks).
router.get('/recommendations', protectAdmin, async (req, res, next) => {
  try {
    const result = await getAiPlatformRecommendations();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/ai/train
// Spawns Python subprocess training job on dynamic dataset and returns summary
router.post('/train', protectAdmin, async (req, res, next) => {
  try {
    let dataset = req.body.dataset;
    if (!dataset || !Array.isArray(dataset) || dataset.length === 0) {
      dataset = [];
      
      // Simulate normal logs (label = 0)
      for (let i = 0; i < 900; i++) {
        dataset.push({
          device_secure: Math.random() > 0.02,
          network_secure: Math.random() > 0.02,
          is_public_network: Math.random() > 0.95,
          device_known: Math.random() > 0.03,
          vpn_active: Math.random() > 0.97,
          ip_changed: Math.random() > 0.90,
          ua_changed: Math.random() > 0.95,
          label: 0
        });
      }

      // Simulate anomaly / attack logs (label = 1)
      for (let i = 0; i < 100; i++) {
        dataset.push({
          device_secure: Math.random() > 0.50,
          network_secure: Math.random() > 0.50,
          is_public_network: Math.random() > 0.30,
          device_known: Math.random() > 0.70,
          vpn_active: Math.random() > 0.20,
          ip_changed: Math.random() > 0.10,
          ua_changed: Math.random() > 0.20,
          label: 1
        });
      }
    }

    const result = await runModelTraining(dataset);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
