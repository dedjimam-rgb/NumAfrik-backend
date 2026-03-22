const express = require("express");
const router = express.Router();
const db = require("../database/db");
const auth = require("../middleware/auth");

router.get("/me", auth, (req, res) => {
  const user = db.prepare(
    "SELECT id, email, name, phone, credits, created_at FROM users WHERE id = ?"
  ).get(req.user.id);

  if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'RECEIVED' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status = 'CANCELED' OR status = 'TIMEOUT' THEN 1 ELSE 0 END) as failed
    FROM orders WHERE user_id = ?
  `).get(req.user.id);

  res.json({ success: true, user, stats });
});

module.exports = router;
