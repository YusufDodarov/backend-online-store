const express = require("express");
const router = express.Router();
const pool = require("./db");
const authMiddleware = require("./authMiddleware");
const cloudinary = require("./cloudinary");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const upload = multer({ storage: multer.memoryStorage() });

router.get("/get-categories", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
    categoryId AS "categoryId",
    categoryName AS "categoryName", 
    categoryImage AS "categoryImage"
  FROM Categories ORDER BY categoryId ASC`,
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/add-category", authMiddleware, upload.any(), async (req, res) => {
  try {
    const { categoryName } = req.body;
    const file = req.files?.[0];

    console.log("categoryName:", categoryName);
    console.log("file:", file?.originalname);

    if (!categoryName) {
      return res.status(400).json({ message: "categoryName required" });
    }

    const categoryId = uuidv4();
    let categoryImage = null;

    if (file) {
      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ folder: "fastcart/categories" }, (error, result) => {
            if (error) reject(error);
            else resolve(result);
          })
          .end(file.buffer);
      });

      categoryImage = `${result.public_id.split("/").pop()}.${result.format}`;
      console.log("✅ Image name with format:", categoryImage);
    }

    const result = await pool.query(
      `INSERT INTO Categories (categoryId, categoryName, categoryImage) 
   VALUES ($1, $2, $3) 
   RETURNING 
    categoryId AS "categoryId",
    categoryName AS "categoryName",
    categoryImage AS "categoryImage"`,
      [categoryId, categoryName, categoryImage],
    );

    res.json({ data: result.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/delete-category", authMiddleware, async (req, res) => {
  try {
    const { categoryId } = req.query;

    if (!categoryId) {
      return res.status(400).json({ message: "categoryId required" });
    }

    const result = await pool.query(
      "DELETE FROM Categories WHERE categoryId = $1 RETURNING *",
      [categoryId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.put(
  "/update-category",
  authMiddleware,
  upload.any(),
  async (req, res) => {
    try {
      const { categoryId, categoryName } = req.body;
      const file = req.files?.[0];

      if (!categoryId) {
        return res.status(400).json({ message: "categoryId required" });
      }

      let categoryImage = null;

      if (file) {
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              { folder: "fastcart/categories" },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              },
            )
            .end(file.buffer);
        });
        categoryImage = result.public_id.split("/").pop();
      }

      const result = await pool.query(
        `UPDATE Categories 
       SET 
         categoryName = COALESCE($1, categoryName),
         categoryImage = COALESCE($2, categoryImage)
       WHERE categoryId = $3
       RETURNING
         categoryId AS "categoryId",
         categoryName AS "categoryName",
         categoryImage AS "categoryImage"`,
        [categoryName || null, categoryImage || null, categoryId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ message: "Category not found" });
      }

      res.json({ data: result.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

module.exports = router;
