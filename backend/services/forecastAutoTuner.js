/**
 * Forecast Auto-Tuner
 *
 * 1. Parameter optimization — grid search for best HW alpha/beta/gamma
 * 2. Adaptive ensemble weights — shift toward most accurate model
 * 3. Bias correction — systematic over/under-prediction adjustment
 * 4. Outlier detection — flag and dampen one-off spikes
 * 5. Rolling recalibration — re-runs on every snapshot
 */

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// ─── Holt-Winters (copied for standalone use) ──────────────
function holtWinters(data, season, alpha, beta, gamma) {
  const n = data.length;
  if (n < season * 2) return null;

  let level = data.slice(0, season).reduce((s, v) => s + v, 0) / season;
  let trend = 0;
  for (let i = 0; i < season; i++) trend += (data[season + i] - data[i]);
  trend /= (season * season);

  const avg = data.slice(0, season).reduce((s, v) => s + v, 0) / season;
  const seasonal = [];
  for (let i = 0; i < season; i++) seasonal[i] = data[i] - avg;

  const fitted = [];
  for (let t = 0; t < n; t++) {
    const sIdx = t % season;
    if (t >= season) {
      const prevLevel = level;
      level = alpha * (data[t] - seasonal[sIdx]) + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      seasonal[sIdx] = gamma * (data[t] - level) + (1 - gamma) * seasonal[sIdx];
    }
    fitted.push(level + trend + seasonal[sIdx]);
  }

  const forecastIdx = n % season;
  const forecast = level + trend + seasonal[forecastIdx];
  const residuals = data.map((v, i) => v - fitted[i]);
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);
  // MAPE for comparability
  const mape = data.reduce((s, v, i) => s + (v > 0 ? Math.abs(residuals[i]) / v : 0), 0) / n * 100;

  return { forecast, rmse, mape, level, trend, seasonal: [...seasonal], fitted, alpha, beta, gamma };
}

// ─── Seasonal Decomposition ────────────────────────────────
function seasonalDecomp(data, season = 12) {
  const n = data.length;
  const monthSums = new Array(season).fill(0);
  const monthCounts = new Array(season).fill(0);
  const overallMean = data.reduce((s, v) => s + v, 0) / n;

  for (let i = 0; i < n; i++) {
    monthSums[i % season] += data[i];
    monthCounts[i % season]++;
  }
  const seasonalIdx = monthSums.map((sum, i) => (sum / monthCounts[i]) / overallMean);
  const deseason = data.map((v, i) => v / seasonalIdx[i % season]);

  const xMean = (n - 1) / 2;
  const yMean = deseason.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (deseason[i] - yMean);
    den += (i - xMean) * (i - xMean);
  }
  const slope = num / den;
  const intercept = yMean - slope * xMean;

  const fitted = data.map((_, i) => (intercept + slope * i) * seasonalIdx[i % season]);
  const residuals = data.map((v, i) => v - fitted[i]);
  const rmse = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / n);
  const mape = data.reduce((s, v, i) => s + (v > 0 ? Math.abs(residuals[i]) / v : 0), 0) / n * 100;

  const forecastIdx = n;
  const monthPos = forecastIdx % season;
  const forecast = (intercept + slope * forecastIdx) * seasonalIdx[monthPos];

  return { forecast, rmse, mape, slope, intercept, seasonalIdx, fitted };
}

// ═══════════════════════════════════════════════════════════
// 1. PARAMETER OPTIMIZATION — Grid search for best HW params
// ═══════════════════════════════════════════════════════════
function optimizeHWParams(data, season = 12) {
  const candidates = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const betaCandidates = [0.01, 0.03, 0.05, 0.1, 0.15];
  let best = null;

  for (const alpha of candidates) {
    for (const beta of betaCandidates) {
      for (const gamma of candidates) {
        const result = holtWinters(data, season, alpha, beta, gamma);
        if (result && (!best || result.rmse < best.rmse)) {
          best = result;
        }
      }
    }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════
// 2. CROSS-VALIDATION — Walk-forward validation
// ═══════════════════════════════════════════════════════════
function walkForwardValidation(data, season = 12, minTrain = 24) {
  const results = { hw_default: [], hw_tuned: [], sd: [], ma3: [] };

  for (let split = minTrain; split < data.length; split++) {
    const train = data.slice(0, split);
    const actual = data[split];

    // HW default
    const hwDef = holtWinters(train, season, 0.3, 0.05, 0.3);
    if (hwDef) results.hw_default.push({ forecast: hwDef.forecast, actual });

    // HW tuned
    const hwTuned = optimizeHWParams(train, season);
    if (hwTuned) results.hw_tuned.push({ forecast: hwTuned.forecast, actual });

    // Seasonal decomp
    const sd = seasonalDecomp(train, season);
    results.sd.push({ forecast: sd.forecast, actual });

    // Moving average
    const ma = train.slice(-3).reduce((s, v) => s + v, 0) / 3;
    results.ma3.push({ forecast: ma, actual });
  }

  // Compute accuracy metrics for each
  const metrics = {};
  for (const [model, preds] of Object.entries(results)) {
    if (preds.length === 0) continue;
    const errors = preds.map(p => p.forecast - p.actual);
    const absErrors = errors.map(e => Math.abs(e));
    const pctErrors = preds.map(p => p.actual > 0 ? Math.abs(p.forecast - p.actual) / p.actual * 100 : 0);

    metrics[model] = {
      count: preds.length,
      mae: absErrors.reduce((s, v) => s + v, 0) / preds.length,
      rmse: Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / preds.length),
      mape: pctErrors.reduce((s, v) => s + v, 0) / preds.length,
      bias: errors.reduce((s, v) => s + v, 0) / preds.length, // positive = overestimates
    };
  }
  return metrics;
}

// ═══════════════════════════════════════════════════════════
// 3. ADAPTIVE ENSEMBLE WEIGHTS
// ═══════════════════════════════════════════════════════════
function computeAdaptiveWeights(metrics, hasCategory = true) {
  // Weight inversely proportional to MAPE
  const models = {};
  if (metrics.hw_tuned) models.hw = 1 / (metrics.hw_tuned.mape + 1);
  if (metrics.sd) models.sd = 1 / (metrics.sd.mape + 1);
  if (hasCategory) models.cat = 0.25; // fixed floor for supply-side reality

  const totalInverse = Object.values(models).reduce((s, v) => s + v, 0);
  const weights = {};
  for (const [k, v] of Object.entries(models)) {
    weights[k] = Math.round(v / totalInverse * 100) / 100;
  }
  return weights;
}

// ═══════════════════════════════════════════════════════════
// 4. BIAS CORRECTION
// ═══════════════════════════════════════════════════════════
function computeBiasCorrection(metrics) {
  // Use recent bias from walk-forward to adjust
  const corrections = {};
  for (const [model, m] of Object.entries(metrics)) {
    // If model consistently overestimates by X, subtract X
    corrections[model] = -m.bias;
  }
  return corrections;
}

// ═══════════════════════════════════════════════════════════
// 5. OUTLIER DETECTION — IQR method on monthly revenues
// ═══════════════════════════════════════════════════════════
function detectOutliers(data) {
  const sorted = [...data].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;

  return data.map((v, i) => ({
    index: i,
    value: v,
    isOutlier: v < lower || v > upper,
    dampened: v < lower ? lower : v > upper ? upper : v,
  }));
}

// ═══════════════════════════════════════════════════════════
// 6. LEARN FROM PAST SNAPSHOTS
// ═══════════════════════════════════════════════════════════
async function learnFromSnapshots() {
  const snapshots = await sequelize.query(`
    SELECT ensemble_forecast, hw_forecast, sd_forecast, ma_forecast, category_forecast,
           actual_revenue, accuracy_pct
    FROM forecast_snapshots
    WHERE actual_revenue IS NOT NULL
    ORDER BY forecast_month ASC
  `, { type: QueryTypes.SELECT });

  if (snapshots.length < 2) return null;

  // Which model was closest for each snapshot?
  const modelWins = { hw: 0, sd: 0, ma: 0, cat: 0 };
  const modelErrors = { hw: [], sd: [], ma: [], cat: [] };

  for (const s of snapshots) {
    const actual = parseFloat(s.actual_revenue);
    if (!actual) continue;
    const models = {
      hw: parseFloat(s.hw_forecast),
      sd: parseFloat(s.sd_forecast),
      ma: parseFloat(s.ma_forecast),
      cat: parseFloat(s.category_forecast),
    };

    let bestModel = null, bestError = Infinity;
    for (const [name, forecast] of Object.entries(models)) {
      if (!forecast) continue;
      const err = Math.abs(forecast - actual);
      modelErrors[name].push((forecast - actual) / actual); // signed pct error
      if (err < bestError) { bestError = err; bestModel = name; }
    }
    if (bestModel) modelWins[bestModel]++;
  }

  // Compute average signed error (bias) per model
  const modelBias = {};
  for (const [name, errors] of Object.entries(modelErrors)) {
    if (errors.length > 0) {
      modelBias[name] = errors.reduce((s, v) => s + v, 0) / errors.length;
    }
  }

  return { modelWins, modelBias, snapshotCount: snapshots.length };
}

// ═══════════════════════════════════════════════════════════
// MAIN: Run full auto-tuning pipeline
// ═══════════════════════════════════════════════════════════
async function autoTune(revenueData) {
  const season = 12;

  console.log('[AutoTuner] Starting parameter optimization...');

  // 1. Detect and dampen outliers
  const outlierAnalysis = detectOutliers(revenueData);
  const dampenedData = outlierAnalysis.map(o => o.dampened);
  const outlierCount = outlierAnalysis.filter(o => o.isOutlier).length;

  // 2. Optimize HW parameters on dampened data
  const bestHW = optimizeHWParams(dampenedData, season);

  // 3. Run walk-forward cross-validation
  const cvMetrics = walkForwardValidation(dampenedData, season);

  // 4. Compute adaptive weights
  const adaptiveWeights = computeAdaptiveWeights(cvMetrics);

  // 5. Compute bias corrections
  const biasCorrections = computeBiasCorrection(cvMetrics);

  // 6. Learn from past snapshots (if available)
  const snapshotLearning = await learnFromSnapshots();

  // If we have snapshot history, blend its insights
  let finalWeights = adaptiveWeights;
  let finalBias = biasCorrections;
  if (snapshotLearning && snapshotLearning.snapshotCount >= 3) {
    // Adjust weights toward historically winning models
    const total = Object.values(snapshotLearning.modelWins).reduce((s, v) => s + v, 0);
    if (total > 0) {
      const winRates = {};
      for (const [m, w] of Object.entries(snapshotLearning.modelWins)) {
        winRates[m] = w / total;
      }
      // Blend: 60% cross-validation weights + 40% historical win rates
      for (const key of Object.keys(finalWeights)) {
        const cvKey = key === 'hw' ? 'hw' : key;
        if (winRates[cvKey] !== undefined) {
          finalWeights[key] = Math.round((finalWeights[key] * 0.6 + winRates[cvKey] * 0.4) * 100) / 100;
        }
      }
      // Renormalize
      const wTotal = Object.values(finalWeights).reduce((s, v) => s + v, 0);
      for (const key of Object.keys(finalWeights)) {
        finalWeights[key] = Math.round(finalWeights[key] / wTotal * 100) / 100;
      }
    }
  }

  // Run the tuned models
  const tunedHW = bestHW;
  const tunedSD = seasonalDecomp(dampenedData, season);
  const tunedMA = { forecast: dampenedData.slice(-3).reduce((s, v) => s + v, 0) / 3 };

  // Apply bias corrections
  const correctedHW = tunedHW ? tunedHW.forecast + (biasCorrections.hw_tuned || 0) : null;
  const correctedSD = tunedSD.forecast + (biasCorrections.sd || 0);

  const result = {
    optimized_params: bestHW ? { alpha: bestHW.alpha, beta: bestHW.beta, gamma: bestHW.gamma } : null,
    default_params: { alpha: 0.3, beta: 0.05, gamma: 0.3 },
    improvement: bestHW ? {
      default_rmse: holtWinters(dampenedData, season, 0.3, 0.05, 0.3)?.rmse || null,
      tuned_rmse: bestHW.rmse,
      pct_improvement: bestHW && holtWinters(dampenedData, season, 0.3, 0.05, 0.3)
        ? Math.round((1 - bestHW.rmse / holtWinters(dampenedData, season, 0.3, 0.05, 0.3).rmse) * 100 * 10) / 10
        : null,
    } : null,
    cross_validation: cvMetrics,
    adaptive_weights: finalWeights,
    bias_corrections: {
      hw: Math.round(biasCorrections.hw_tuned || 0),
      sd: Math.round(biasCorrections.sd || 0),
      ma: Math.round(biasCorrections.ma3 || 0),
    },
    outliers: {
      count: outlierCount,
      indices: outlierAnalysis.filter(o => o.isOutlier).map(o => ({ index: o.index, original: o.value, dampened: o.dampened })),
    },
    snapshot_learning: snapshotLearning,
    tuned_forecasts: {
      hw: correctedHW ? Math.round(correctedHW) : null,
      sd: Math.round(correctedSD),
      ma: Math.round(tunedMA.forecast),
    },
  };

  console.log(`[AutoTuner] Done. HW params: α=${bestHW?.alpha} β=${bestHW?.beta} γ=${bestHW?.gamma} | Weights: ${JSON.stringify(finalWeights)} | Outliers: ${outlierCount}`);

  return result;
}

module.exports = { autoTune, optimizeHWParams, walkForwardValidation, computeAdaptiveWeights, detectOutliers };
