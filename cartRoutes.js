const express = require("express");
const router = express.Router();
const pool = require("./db");
const authMiddleware = require("./authMiddleware");

router.get("/get-products-from-cart", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;

    const result = await pool.query(
      `SELECT
    c.id,
    c.quantity AS "cartQuantity",
    p.productid AS "productId",
    p.productname AS "productName",
    COALESCE((p.images::jsonb->0->>'image'), '') AS image,
    p.price,
    p.discount AS "disCount",
    p.quantity AS "stockQuantity",
    p.category
  FROM Cart c
  JOIN Products p ON c."productId" = p.productid::text::uuid
  WHERE c."userId"::text = $1`,
      [userId],
    );

    const data = result.rows.map((row) => ({
      id: row.id,
      quantity: row.cartQuantity,
      product: {
        productId: row.productId,
        productName: row.productName,
        image: row.image,
        price: row.price,
        disCount: row.disCount,
        category: row.category,
        quantity: row.stockQuantity,
      },
    }));

    res.json({ data });
  } catch (err) {
    console.error("GET CART ERROR:", err);
    res.status(500).json({ message: "error" });
  }
});

router.post("/add-product-to-cart", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productId } = req.query;

    const existing = await pool.query(
      `SELECT id, quantity FROM Cart WHERE "userId" = $1::uuid AND "productId"::uuid = $2::uuid`,
      [userId, productId],
    );

    if (existing.rows.length > 0) {
      const newQuantity = existing.rows[0].quantity + 1;
      await pool.query(`UPDATE Cart SET quantity = $1 WHERE id = $2`, [
        newQuantity,
        existing.rows[0].id,
      ]);
      return res.status(200).json({
        message: "Product quantity increased",
        id: existing.rows[0].id,
      });
    }
    let randomId;
    let isUnique = false;
    while (!isUnique) {
      randomId = Math.floor(Math.random() * 9001) + 1000;
      const check = await pool.query(`SELECT id FROM Cart WHERE id = $1`, [
        randomId,
      ]);
      if (check.rows.length === 0) isUnique = true;
    }
    await pool.query(
      `INSERT INTO Cart (id, "userId", "productId", quantity)
    VALUES ($1, $2::uuid, $3, 1)`,
      [randomId, userId, productId],
    );

    res.status(201).json({ message: "Product added to cart", id: randomId });
  } catch (err) {
    console.error("POST CART ERROR:", err);
    res.status(500).json({ message: "error" });
  }
});

router.delete("/delete-product-from-cart", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productId } = req.query;

    await pool.query(
      `DELETE FROM Cart WHERE "userId"::text = $1 AND "productId"::text = $2`,
      [userId, productId],
    );

    res.json({ message: "Product removed from cart" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "error" });
  }
});

router.delete("/decrease-product-in-cart", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { id } = req.query;

    const result = await pool.query(
      `SELECT id, quantity FROM Cart WHERE id = $1 AND "userId"::text = $2`,
      [id, userId],
    );

    const item = result.rows[0];
    if (!item) return res.status(404).json({ message: "Not found" });

    if (item.quantity <= 1) {
      await pool.query(`DELETE FROM Cart WHERE id = $1`, [id]);
    } else {
      await pool.query(
        `UPDATE Cart SET quantity = quantity - 1 WHERE id = $1`,
        [id],
      );
    }

    res.json({ message: "Decreased" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "error" });
  }
});

router.delete("/clear-cart", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    await pool.query(`DELETE FROM Cart WHERE "userId"::text = $1`, [userId]);
    res.json({ message: "Cart cleared" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "error" });
  }
});

module.exports = router;
