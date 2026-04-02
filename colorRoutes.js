const express = require("express");
const router = express.Router();
const pool = require("./db");
const authMiddleware = require("./authMiddleware");

router.get("/get-colors",async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT colorId AS "colorId", colorName AS "colorName", color FROM Colors ORDER BY colorId ASC`,
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/add-color", authMiddleware, async (req, res) => {
  try {
    const colorName = req.body.colorName;
    const color = req.body.color;
    if (!colorName || !color) {
      return res.status(400).json({ message: "colorName and color required" });
    }
    const colorId = Date.now();
    const result = await pool.query(
      `INSERT INTO Colors (colorId, colorName, color) VALUES ($1, $2, $3) 
       RETURNING colorId AS "colorId", colorName AS "colorName", color`,
      [colorId, colorName, color],
    );
    res.json({ message: "Color added successfully", data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/delete-color", authMiddleware, async (req, res) => {
  try {
    const { colorId } = req.query;
    if (!colorId) {
      return res.status(400).json({ message: "colorId required" });
    }
    const result = await pool.query(
      "DELETE FROM Colors WHERE colorId = $1 RETURNING *",
      [colorId],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Color not found" });
    }
    res.json({ message: "Color deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
