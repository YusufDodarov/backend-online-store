const express = require("express");
const router = express.Router();
const pool = require("./db");
const authMiddleware = require("./authMiddleware");
const cloudinary = require("./cloudinary");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const upload = multer({ storage: multer.memoryStorage() });
router.post(
  "/add-product",
  authMiddleware,
  upload.array("images"),
  async (req, res) => {
    try {
      const {
        productName,
        code,
        price,
        count,
        description,
        category,
        brand,
        disCount,
      } = req.body;
      const imageFiles = req.files || [];

      if (
        !productName ||
        !code ||
        !price ||
        !count ||
        !category ||
        imageFiles.length === 0
      ) {
        return res.status(400).json({
          message: "productName, code, price, quantity and images are required",
        });
      }

      const productId = uuidv4();
      const date = new Date().toISOString();

      const uploadedImages = await Promise.all(
        imageFiles.map(
          (file, index) =>
            new Promise((resolve, reject) => {
              cloudinary.uploader
                .upload_stream(
                  { folder: "fastcart/products" },
                  (error, result) => {
                    if (error) reject(error);
                    else
                      resolve({
                        id: index + 1,
                        image: `${result.public_id.split("/").pop()}.${result.format}`,
                      });
                  },
                )
                .end(file.buffer);
            }),
        ),
      );

      const parsedColors = req.body.colors
        ? typeof req.body.colors === "string"
          ? JSON.parse(req.body.colors)
          : req.body.colors
        : null;

      const parsedSizes = req.body.size
        ? typeof req.body.size === "string"
          ? JSON.parse(req.body.size)
          : req.body.size
        : null;

      const parsedWeights = req.body.weight
        ? typeof req.body.weight === "string"
          ? JSON.parse(req.body.weight)
          : req.body.weight
        : null;

      const toNum = (val) => {
        if (val === null || val === undefined || val === "null" || val === "")
          return null;
        const n = Number(val);
        return isNaN(n) ? null : n;
      };
      const discountNum = toNum(disCount, 0);
      const hasDiscount = discountNum > 0;

      const result = await pool.query(
        `INSERT INTO Products 
    (productId, productName, description, category, brand, code, price, quantity, discount, hasDiscount, colors, sizes, weights, images, date, isViewed, viewCount)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
   RETURNING *`,
        [
          productId,
          productName,
          description || null,
          category || null,
          brand || null,
          code,
          toNum(price, 0),
          toNum(count, 0),
          discountNum,
          hasDiscount,
          parsedColors ? JSON.stringify(parsedColors) : null,
          parsedSizes,
          parsedWeights,
          JSON.stringify(uploadedImages),
          date,
          false,
          0,
        ],
      );

      res.json({ data: result.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

router.delete("/delete-product", authMiddleware, async (req, res) => {
  try {
    const { productId } = req.query;

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    const productResult = await pool.query(
      "SELECT images FROM Products WHERE productid = $1",
      [productId],
    );
    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }
    let imagesData = productResult.rows[0].images;

    let images = [];

    if (imagesData) {
      if (typeof imagesData === "string") {
        try {
          images = JSON.parse(imagesData);
        } catch (err) {
          console.error("Error parsing images JSON:", err);
          images = [];
        }
      } else if (Array.isArray(imagesData)) {
        images = imagesData;
      }
    }
    for (const img of images) {
      try {
        await cloudinary.uploader.destroy(`fastcart/products/${img.image}`);
      } catch (err) {
        console.error("Error deleting image from Cloudinary:", err);
      }
    }
    await pool.query("DELETE FROM Products WHERE productid = $1", [productId]);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/get-products", async (req, res) => {
  try {
    const pageSize = parseInt(req.query.PageSize) || 100;

    const result = await pool.query(
      `SELECT 
        productid AS "productId", 
        productname AS "productName",
        category,
        brand,
        price,
        quantity,
        discount AS "disCount",
        hasdiscount as "hasDisCount",
        images,
        date AS "dateAt",
        isviewed AS "isViewed",
        viewcount AS "viewCount"
      FROM Products 
      ORDER BY RANDOM() 
      LIMIT $1`,
      [pageSize],
    );

    const data = result.rows.map((item) => {
      const image =
        item.images && item.images.length > 0 ? item.images[0].image : null;
      const { images: _, ...rest } = item;
      return { ...rest, image };
    });

    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------- Ислоҳшуда -----------------
router.get("/get-products-by-id", async (req, res) => {
  const productId = req.query.productId;
  const token = req.headers.authorization;

  if (!productId)
    return res.status(400).json({ message: "productId is required" });

  try {
    const result = await pool.query(
      `SELECT productId AS "productId",
              productName AS "productName",
              description AS "description",
              category AS "category",
              brand AS "brand",
              code AS "code",
              price AS "price",
              quantity AS "quantity",
              discount AS "disCount",
              hasDiscount AS "hasDisCount",
              colors AS "colors",
              sizes AS "sizes",
              weights AS "weights",
              date AS "dateAt",
              isViewed AS "isViewed",
              viewCount AS "viewCount",
              images AS "images"
       FROM Products
       WHERE productId=$1`,
      [productId],
    );

    if (!result.rows[0])
      return res.status(404).json({ message: "Product not found" });

    let product = result.rows[0];

    if (token) {
      const viewCheck = await pool.query(
        `SELECT * FROM ProductViews WHERE productId=$1 AND userToken=$2`,
        [productId, token],
      );

      if (viewCheck.rows.length === 0) {
        await pool.query(
          `INSERT INTO ProductViews(productId, userToken) VALUES ($1,$2)`,
          [productId, token],
        );
        await pool.query(
          `UPDATE Products SET viewCount=viewCount+1, isViewed=true WHERE productId=$1`,
          [productId],
        );

        const updated = await pool.query(
          `SELECT productId AS "productId",
                  productName AS "productName",
                  description AS "description",
                  category AS "category",
                  brand AS "brand",
                  code AS "code",
                  price AS "price",
                  quantity AS "quantity",
                  discount AS "disCount",
                  hasDiscount AS "hasDisCount",
                  colors AS "colors",
                  sizes AS "sizes",
                  weights AS "weights",
                  date AS "dateAt",
                  isViewed AS "isViewed",
                  viewCount AS "viewCount",
                  images AS "images"
           FROM Products
           WHERE productId=$1`,
          [productId],
        );
        product = updated.rows[0];
      }
    }
    res.json({ data: product });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/delete-image-from-product", authMiddleware, async (req, res) => {
  try {
    const { productId, imageId } = req.body;

    if (!productId || imageId === undefined) {
      return res
        .status(400)
        .json({ message: "productId and imageId are required" });
    }

    const productResult = await pool.query(
      "SELECT images FROM Products WHERE productid = $1",
      [productId],
    );

    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: "Product not found" });
    }

    let images = productResult.rows[0].images;
    if (typeof images === "string") images = JSON.parse(images);

    const targetImage = images.find((img) => img.id === imageId);
    if (!targetImage) {
      return res.status(404).json({ message: "Image not found" });
    }
    const publicId = `fastcart/products/${targetImage.image.replace(/\.[^/.]+$/, "")}`;
    await cloudinary.uploader.destroy(publicId);
    const updatedImages = images.filter((img) => img.id !== imageId);

    await pool.query("UPDATE Products SET images = $1 WHERE productid = $2", [
      JSON.stringify(updatedImages),
      productId,
    ]);

    res.json({ message: "Image deleted successfully", imageId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post(
  "/add-image-to-product",
  authMiddleware,
  upload.array("images"),
  async (req, res) => {
    try {
      const { productId } = req.body;
      const imageFiles = req.files || [];

      if (!productId || imageFiles.length === 0) {
        return res
          .status(400)
          .json({ message: "productId and images are required" });
      }

      const productResult = await pool.query(
        "SELECT images FROM Products WHERE productid = $1",
        [productId],
      );

      if (productResult.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      let existingImages = productResult.rows[0].images || [];
      if (typeof existingImages === "string")
        existingImages = JSON.parse(existingImages);

      const uploadedImages = await Promise.all(
        imageFiles.map(
          (file) =>
            new Promise((resolve, reject) => {
              cloudinary.uploader
                .upload_stream(
                  { folder: "fastcart/products" },
                  (error, result) => {
                    if (error) reject(error);
                    else
                      resolve({
                        id: Date.now() + Math.random(),
                        image: `${result.public_id.split("/").pop()}.${result.format}`,
                      });
                  },
                )
                .end(file.buffer);
            }),
        ),
      );

      const updatedImages = [...existingImages, ...uploadedImages];

      await pool.query("UPDATE Products SET images = $1 WHERE productid = $2", [
        JSON.stringify(updatedImages),
        productId,
      ]);

      res.json({ data: uploadedImages });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

router.put(
  "/update-product",
  authMiddleware,
  upload.none(),
  async (req, res) => {
    try {
      const {
        productId,
        productName,
        description,
        category,
        brand,
        code,
        price,
        count,
        disCount,
        colors,
        size,
        weight,
      } = req.body;

      if (!productId) {
        return res.status(400).json({ message: "productId is required" });
      }

      // Маҳсулоти кӯҳнаро гиред
      const existing = await pool.query(
        `SELECT 
          productname AS "productName",
          description,
          category,
          brand,
          code,
          price,
          quantity,
          discount AS "disCount",
          colors,
          sizes,
          weights
        FROM Products WHERE productid = $1`,
        [productId],
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ message: "Product not found" });
      }

      const old = existing.rows[0];

      const toNum = (val) => {
        if (val === null || val === undefined || val === "null" || val === "")
          return null;
        const n = Number(val);
        return isNaN(n) ? null : n;
      };

      const parsedColors = colors
        ? typeof colors === "string"
          ? JSON.parse(colors)
          : colors
        : null;

      const parsedSizes = size
        ? typeof size === "string"
          ? JSON.parse(size)
          : size
        : null;

      const parsedWeights = weight
        ? typeof weight === "string"
          ? JSON.parse(weight)
          : weight
        : null;

      const discountNum = toNum(disCount);

      const isChanged =
        productName !== old.productName ||
        (description || null) !== old.description ||
        (category || null) !== old.category ||
        (brand || null) !== old.brand ||
        code !== old.code ||
        toNum(price) !== toNum(old.disCount) ||
        toNum(count) !== old.quantity ||
        discountNum !== toNum(old.disCount) ||
        JSON.stringify(parsedColors) !== JSON.stringify(old.colors) ||
        JSON.stringify(parsedSizes) !== JSON.stringify(old.sizes) ||
        JSON.stringify(parsedWeights) !== JSON.stringify(old.weights);

      if (!isChanged) {
        return res.status(400).json({ message: "No changes detected" });
      }

      const hasDiscount = discountNum > 0;

      const result = await pool.query(
        `UPDATE Products SET
          productName = $1,
          description = $2,
          category = $3,
          brand = $4,
          code = $5,
          price = $6,
          quantity = $7,
          discount = $8,
          hasDiscount = $9,
          colors = $10,
          sizes = $11,
          weights = $12
        WHERE productid = $13
        RETURNING *`,
        [
          productName,
          description || null,
          category || null,
          brand || null,
          code,
          toNum(price),
          toNum(count),
          discountNum,
          hasDiscount,
          parsedColors ? JSON.stringify(parsedColors) : null,
          parsedSizes,
          parsedWeights,
          productId,
        ],
      );

      res.json({ data: result.rows[0] });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

module.exports = router;
