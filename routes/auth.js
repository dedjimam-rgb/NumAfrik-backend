const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../database/db");

const JWT_SECRET = process.env.JWT_SECRET || "numafrik_secret";

router.post("/register", async (req, res) => {
  const { email, password, name, phone } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }

  try {
    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    if (existing) return res.status(409).json({ error: "Email déjà utilisé" });

    const hashed = await bcrypt.hash(password, 10);
    const result = db.prepare(
      "INSERT INTO users (email, password, name, phone) VALUES (?, ?, ?, ?)"
    ).run(email, hashed, name || "", phone || "");

    const token = jwt.sign(
      { id: result.lastInsertRowid, email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      success: true,
      message: "Compte créé avec succès",
      token,
      user: { id: result.lastInsertRowid, email, name, credits: 0 },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis" });
  }

  try {
    const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!user) return res.status(401).json({ error: "Email ou mot de passe incorrect" });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Email ou mot de passe incorrect" });

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, credits: user.credits },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
