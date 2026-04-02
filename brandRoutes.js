const express = require("express");
const router = express.Router();
const pool = require("./db");
const authMiddleware = require("./authMiddleware");

router.get("/get-brands", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT brandId AS "brandId", brandName AS "brandName" FROM Brands ORDER BY brandId ASC`,
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/add-brand", authMiddleware, async (req, res) => {
  try {
    const { brandName } = req.query;
    if (!brandName)
      return res.status(400).json({ message: "brandName required" });

    const brandId = Math.floor(Math.random() * 100) + 1;
    const result = await pool.query(
      `INSERT INTO Brands (brandName) VALUES ($1) 
   RETURNING brandId AS "brandId", brandName AS "brandName"`,
      [brandName],
    );
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/update-brand", authMiddleware, async (req, res) => {
  try {
    const { brandId, brandName } = req.body;
    if (!brandId) return res.status(400).json({ message: "brandId required" });

    const result = await pool.query(
      `UPDATE Brands SET brandName = $1 WHERE brandId = $2
       RETURNING brandId AS "brandId", brandName AS "brandName"`,
      [brandName, brandId],
    );
    if (result.rowCount === 0)
      return res.status(404).json({ message: "Brand not found" });
    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/delete-brand", authMiddleware, async (req, res) => {
  try {
    const { brandId } = req.query;
    if (!brandId) return res.status(400).json({ message: "brandId required" });

    const result = await pool.query(
      "DELETE FROM Brands WHERE brandId = $1 RETURNING *",
      [brandId],
    );
    if (result.rowCount === 0)
      return res.status(404).json({ message: "Brand not found" });
    res.json({ message: "Brand deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
