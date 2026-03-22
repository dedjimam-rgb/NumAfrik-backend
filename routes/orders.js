const express = require("express");
const router = express.Router();
const fivesim = require("../services/fivesim");
const db = require("../database/db");
const auth = require("../middleware/auth");

const MARGIN_FCFA = Number(process.env.DEFAULT_MARGIN_FCFA) || 200;
const FCFA_PER_DOLLAR = 650;
const SMS_TIMEOUT = Number(process.env.SMS_TIMEOUT_SECONDS) || 1200;

function calcPrice(cost5sim) {
  const costFcfa = Math.ceil(cost5sim * FCFA_PER_DOLLAR);
  const totalFcfa = costFcfa + MARGIN_FCFA;
  return { costFcfa, totalFcfa, margin: MARGIN_FCFA };
}

router.get("/countries/:service", auth, async (req, res) => {
  try {
    const countries = await fivesim.getCountries(req.params.service);
    const withPrice = countries.map(c => ({ ...c, ...calcPrice(c.cost) }));
    res.json({ success: true, countries: withPrice });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/buy", auth, async (req, res) => {
  const { service, country, operator = "any" } = req.body;
  const userId = req.user.id;

  if (!service || !country) {
    return res.status(400).json({ error: "Service et pays requis" });
  }

  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    const countries = await fivesim.getCountries(service);
    const countryData = countries.find(c => c.code === country);
    if (!countryData) return res.status(400).json({ error: "Pays non disponible" });

    const { totalFcfa, costFcfa, margin } = calcPrice(countryData.cost);

    if (user.credits < totalFcfa) {
      return res.status(402).json({
        error: "Solde insuffisant",
        required: totalFcfa,
        balance: user.credits,
        missing: totalFcfa - user.credits,
      });
    }

    const order5sim = await fivesim.buyNumber(country, operator, service);

    db.prepare("UPDATE users SET credits = credits - ? WHERE id = ?")
      .run(totalFcfa, userId);

    const expiresAt = new Date(Date.now() + SMS_TIMEOUT * 1000).toISOString();
    const result = db.prepare(`
      INSERT INTO orders (user_id, fivesim_id, service, country, phone_number, status, cost_fcfa, cost_5sim, margin_fcfa, expires_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)
    `).run(userId, order5sim.id, service, country, order5sim.phone, totalFcfa, countryData.cost, margin, expiresAt);

    startSmsPolling(result.lastInsertRowid, order5sim.id, userId, totalFcfa);

    res.json({
      success: true,
      orderId: result.lastInsertRowid,
      phone: order5sim.phone,
      expiresAt,
      pricePaid: totalFcfa,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/history", auth, (req, res) => {
  const orders = db.prepare(
    "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20"
  ).all(req.user.id);
  res.json({ success: true, orders });
});

router.get("/:id/status", auth, async (req, res) => {
  const order = db.prepare(
    "SELECT * FROM orders WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: "Commande introuvable" });
  res.json({ success: true, status: order.status, phone: order.phone_number, code: order.sms_code });
});

router.post("/:id/cancel", auth, async (req, res) => {
  const order = db.prepare(
    "SELECT * FROM orders WHERE id = ? AND user_id = ?"
  ).get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: "Commande introuvable" });
  if (order.status !== "PENDING") return res.status(400).json({ error: "Commande déjà traitée" });

  try {
    if (order.fivesim_id) await fivesim.cancelOrder(order.fivesim_id);
    db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(order.cost_fcfa, req.user.id);
    db.prepare("UPDATE orders SET status = 'CANCELED', finished_at = datetime('now') WHERE id = ?").run(order.id);
    res.json({ success: true, message: "Annulé — remboursement effectué", refunded: order.cost_fcfa });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function startSmsPolling(orderId, fivesimId, userId, costFcfa) {
  const maxAttempts = Math.floor(SMS_TIMEOUT / 5);
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;
    try {
      const result = await fivesim.checkSms(fivesimId);
      if (result.code) {
        clearInterval(interval);
        db.prepare("UPDATE orders SET status = 'RECEIVED', sms_code = ?, finished_at = datetime('now') WHERE id = ?")
          .run(result.code, orderId);
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        await fivesim.cancelOrder(fivesimId);
        db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?").run(costFcfa, userId);
        db.prepare("UPDATE orders SET status = 'TIMEOUT', finished_at = datetime('now') WHERE id = ?").run(orderId);
      }
    } catch (err) {
      console.error(`Erreur polling #${orderId}:`, err.message);
    }
  }, 5000);
}

module.exports = router;
