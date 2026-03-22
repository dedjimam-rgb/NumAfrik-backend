const express = require("express");
const router = express.Router();
const db = require("../database/db");
const auth = require("../middleware/auth");

const CINETPAY_API_KEY = process.env.CINETPAY_API_KEY;
const CINETPAY_SITE_ID = process.env.CINETPAY_SITE_ID;

const FCFA_TO_CREDITS = {
  500: 5,
  1000: 11,
  2000: 24,
  5000: 62,
  10000: 130,
  20000: 270,
};

router.post("/initiate", auth, async (req, res) => {
  const { amount_fcfa } = req.body;
  const credits = FCFA_TO_CREDITS[amount_fcfa];
  if (!credits) return res.status(400).json({ error: "Montant invalide" });

  try {
    const transactionId = `NA${Date.now()}_${req.user.id}`;

    db.prepare(`
      INSERT INTO transactions (user_id, type, amount_fcfa, credits_added, payment_method, payment_ref, status)
      VALUES (?, 'RECHARGE', ?, ?, 'CINETPAY', ?, 'PENDING')
    `).run(req.user.id, amount_fcfa, credits, transactionId);

    const cinetpayRes = await fetch("https://api-checkout.cinetpay.com/v2/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey: CINETPAY_API_KEY,
        site_id: CINETPAY_SITE_ID,
        transaction_id: transactionId,
        amount: amount_fcfa,
        currency: "XOF",
        description: `Recharge NumAfrik — ${credits} crédits`,
        notify_url: `${process.env.BACKEND_URL}/api/payments/notify`,
        return_url: `${process.env.FRONTEND_URL}/recharge/success`,
        channels: "MOBILE_MONEY",
        lang: "fr",
      }),
    });

    const data = await cinetpayRes.json();
    if (data.code !== "201") throw new Error(data.message || "Erreur CinetPay");

    res.json({ success: true, paymentUrl: data.data.payment_url, transactionId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/notify", async (req, res) => {
  const { cpm_trans_id, cpm_result } = req.body;

  if (cpm_result !== "00") {
    db.prepare("UPDATE transactions SET status = 'FAILED' WHERE payment_ref = ?").run(cpm_trans_id);
    return res.json({ message: "Paiement échoué" });
  }

  const transaction = db.prepare("SELECT * FROM transactions WHERE payment_ref = ?").get(cpm_trans_id);
  if (!transaction || transaction.status === "SUCCESS") return res.json({ message: "Déjà traité" });

  db.prepare("UPDATE users SET credits = credits + ? WHERE id = ?")
    .run(transaction.credits_added, transaction.user_id);
  db.prepare("UPDATE transactions SET status = 'SUCCESS' WHERE payment_ref = ?").run(cpm_trans_id);

  res.json({ message: "OK" });
});

module.exports = router;
