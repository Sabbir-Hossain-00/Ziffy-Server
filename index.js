require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = 3000;

// midleware
app.use(
  cors({
    origin: ["http://localhost:5173","https://ziffy-00.web.app"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// verify token
const verifyToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized" });
    }
    req.decoded = decoded;
    next();
  });
};

const verifyEmail = (req, res, next) => {
  const email = req.query.email;
  if (req.decoded.email !== email) {
    return res.status(403).send({ message: "Forbidden access" });
  }
  next();
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vlrcl7k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    // collections
    const db = client.db("ziffyData");
    const userCollection = db.collection("userCollection");
    const postCollection = db.collection("postCollection");
    const commentCollection = db.collection("commentCollection");
    const paymentCollection = db.collection("paymentCollection");
    const reportCollection = db.collection("reportCollection");
    const tagCollection = db.collection("tagCollection");
    const announcementCollection = db.collection("announcementCollection");

    // verify admin api
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const user = await userCollection.findOne({ email });
      if (!user || user?.role !== "admin") {
        return res.status(403).send({ message: "Access denied" });
      }
      next();
    };

    // jwt token create and set to cookie
    app.post("/jwt", async (req, res) => {
      const { email } = req.body;
      const token = jwt.sign({ email }, process.env.JWT_SECRET, {
        expiresIn: "365d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: true,
          sameSite:"none",
        })
        .send({ success: true });
    });

    // jwt token clear from cookie
    app.post("/logout", async (req, res) => {
      res.clearCookie("token", {
        httpOnly: true,
        secure: false,
      });
      res.send({ message: "logged out successfully" });
    });

    // users get
    app.get("/all-user", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/user", verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;
      const filter = { email };
      const result = await userCollection.findOne(filter);
      res.send(result);
    });

    // users post
    app.post("/user", async (req, res) => {
      const userData = req.body;
      userData.created_at = new Date().toISOString();
      userData.role = "user";
      const existingUser = await userCollection.findOne({
        email: userData?.email,
      });
      if (existingUser) {
        return res.send({ message: "User Already Exist" });
      }
      const result = await userCollection.insertOne(userData);
      res.send(result);
    });

    // all-post get method
    app.get("/all-post", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;
      const [posts, total] = await Promise.all([
        postCollection
          .find()
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        postCollection.countDocuments(),
      ]);
      res.send({
        posts,
        totalPages: Math.ceil(total / limit),
      });
    });

    app.get("/pagination-post", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;

      const [posts, total] = await Promise.all([
        postCollection
          .find()
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        postCollection.estimatedDocumentCount(),
      ]);

      res.send({
        posts,
        totalPages: Math.ceil(total / limit),
      });
    });

    // sigle post get method
    app.get("/post-details/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await postCollection.findOne(filter);
      res.send(result);
    });

    // get post by search
    app.get("/search-post", async (req, res) => {
      const searchResult = req.query.tag;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;
      const query = {
        tag: { $regex: searchResult, $options: "i" },
      };

      // console.log(searchResult);
      const [posts, total] = await Promise.all([
        postCollection.find(query).skip(skip).limit(limit).toArray(),
        postCollection.countDocuments(query),
      ]);
      res.send({
        posts,
        totalPages: Math.ceil(total / limit),
      });
    });

    // get all teh tags
    app.get("/all-tags", async (req, res) => {
      try {
        const result = await postCollection
          .aggregate([
            {
              $group: {
                _id: "$tag",
              },
            },
            {
              $project: {
                _id: 0,
                tag: "$_id",
              },
            },
          ])
          .toArray();

        // Map only tag names into an array
        const tags = result.map((item) => item.tag);
        res.send(tags); // Example: ["Education", "Health", "Tech"]
      } catch (error) {
        console.error("Error fetching tags:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // mypost get method
    app.get("/my-post", verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;
      const filter = { authorEmail: email };
      const result = await postCollection.find(filter).toArray();
      res.send(result);
    });

    app.delete("/delete-my-post/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await postCollection.deleteOne(query);
      res.send(result);
    });

    // mypost count get method
    app.get("/myPost-count", verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;
      const filter = { authorEmail: email };
      const result = await postCollection.countDocuments(filter);
      res.send(result);
    });

    // add post post method
    app.post("/post", verifyToken, async (req, res) => {
      const postData = req.body;
      postData.created_at = new Date().toISOString();
      const result = await postCollection.insertOne(postData);
      res.send(result);
    });

    // get comment for individual post
    app.get("/post-comment", verifyToken, async (req, res) => {
      const postId = req.query.id;
      const query = { postId };
      const result = await commentCollection.find(query).toArray();
      res.send(result);
    });

    // post-summary api
    app.get("/post-summary/:id", async (req, res) => {
      try {
        const postId = new ObjectId(req.params.id);

        const result = await postCollection
          .aggregate([
            {
              $match: { _id: new ObjectId(req.params.id) },
            },
            {
              $lookup: {
                from: "commentCollection", // change to your actual comment collection name
                let: { postIdStr: { $toString: "$_id" } },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$postId", "$$postIdStr"],
                      },
                    },
                  },
                ],
                as: "comments",
              },
            },
            {
              $project: {
                _id: 0,
                upVote: 1,
                downVote: 1,
                totalVote: 1,
                commentsCount: { $size: "$comments" },
              },
            },
          ])
          .toArray();

        if (!result.length) {
          return res.status(404).json({ message: "Post not found" });
        }

        res.send(result[0]);
      } catch (err) {
        console.error("Post summary error:", err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // comment post method
    app.post("/comment", verifyToken, async (req, res) => {
      const commentData = req.body;
      commentData.created_at = new Date().toISOString();
      const result = await commentCollection.insertOne(commentData);
      res.send(result);
    });

    // up vote and down vote patch and total vote count and update postCollection
    // PATCH /vote/:postId
    app.patch("/vote/:id", verifyToken, async (req, res) => {
      try {
        const postId = req.params.id;
        const { email, vote } = req.body;

        if (!email || !vote) {
          return res
            .status(400)
            .send({ message: "Email and vote are required" });
        }

        const post = await postCollection.findOne({
          _id: new ObjectId(postId),
        });
        if (!post) {
          return res.status(404).send({ message: "Post not found" });
        }

        const existingVoter = post.voters?.find((v) => v.email === email);

        let updateQuery = {};
        let updateOptions = {}; // ✅ New: Only use arrayFilters conditionally

        if (!existingVoter) {
          // ✅ First time vote — no arrayFilters needed
          updateQuery = {
            $inc: { [vote === "up" ? "upVote" : "downVote"]: 1 },
            $push: { voters: { email, vote } },
          };
        } else if (existingVoter.vote !== vote) {
          // ✅ Switching vote — use arrayFilters
          updateQuery = {
            $inc: {
              [vote === "up" ? "upVote" : "downVote"]: 1,
              [vote === "up" ? "downVote" : "upVote"]: -1,
            },
            $set: {
              "voters.$[elem].vote": vote,
            },
          };
          updateOptions = {
            arrayFilters: [{ "elem.email": email }],
          };
        } else {
          // ✅ Already voted the same
          return res.send({ message: "Already voted" });
        }

        // ✅ Apply update with or without arrayFilters
        const updateResult = await postCollection.updateOne(
          { _id: new ObjectId(postId) },
          updateQuery,
          updateOptions
        );

        // ✅ Aggregate totalVote = upVote - downVote
        const [summary] = await postCollection
          .aggregate([
            { $match: { _id: new ObjectId(postId) } },
            {
              $project: {
                upVote: 1,
                downVote: 1,
                totalVote: { $subtract: ["$upVote", "$downVote"] },
              },
            },
          ])
          .toArray();

        // ✅ Update totalVote field
        await postCollection.updateOne(
          { _id: new ObjectId(postId) },
          { $set: { totalVote: summary.totalVote } }
        );

        res.send({
          message: "Vote updated successfully",
          updateResult,
          totalVote: summary.totalVote,
        });
      } catch (err) {
        console.error("Vote error:", err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // short by popularity get
    app.get("/popular-post", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const skip = (page - 1) * limit;
      const [posts, total] = await Promise.all([
        postCollection
          .find()
          .sort({
            totalVote: -1,
            created_at: -1,
          })
          .skip(skip)
          .limit(limit)
          .toArray(),
        postCollection.countDocuments(),
      ]);
      res.send({
        posts,
        totalPages: Math.ceil(total / limit),
      });
    });

    app.get("/popular", async(req , res)=>{
      const result = await postCollection.find().toArray();
      const popularPost = result.filter((item)=> item.totalVote >= 2)
      res.send(popularPost)
    })

    // report post api
    app.post("/report", verifyToken, async (req, res) => {
      const reportData = req.body;
      const result = await reportCollection.insertOne(reportData);
      res.send(result);
    });

    // GET user profile and 3 recent posts
    app.get("/user-profile", verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;

      try {
        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).send({ message: "User not found" });

        const posts = await postCollection
          .find({ authorEmail: email })
          .sort({ created_at: -1 })
          .limit(3)
          .toArray();

        res.send({
          user,
          posts,
        });
      } catch (error) {
        res.status(500).send({ message: "Server error", error });
      }
    });

    // get tag at tag collection
    app.get("/tags", verifyToken, async (req, res) => {
      const tags = await tagCollection.find().toArray();
      res.send(tags);
    });

    // post tag at tagcollection
    app.post("/add-tag", verifyToken, async (req, res) => {
      const tagData = req.body;
      if (!tagData) return res.status(400).send({ message: "Tag is required" });

      const result = await tagCollection.insertOne(tagData);
      res.send(result);
    });

    
    // admin profile stats
    app.get("/site-stats", verifyToken, async (req, res) => {
      try {
        const [postCount, commentCount, userCount] = await Promise.all([
          postCollection.countDocuments(),
          commentCollection.countDocuments(),
          userCollection.countDocuments(),
        ]);

        res.send({ postCount, commentCount, userCount });
      } catch (error) {
        console.error("Error fetching site stats:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //  GET /users?email=xyz@gmail.com → search by email (partial match)
    app.get("/users", verifyToken,verifyAdmin, async (req, res) => {
      const name = req.query.name || "";
      const query = {
        name: { $regex: name, $options: "i" }, // case-insensitive partial match
      };
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    //  PATCH /make-admin/:id → promote a user to admin
    app.patch("/make-admin/:id", verifyToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: { role: "admin" },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // get announcment
    app.get("/announcments", async (req, res) => {
      const result = await announcementCollection.find().toArray();
      res.send(result);
    });

    // delete announcement

    app.delete("/delete-announcement/:id",verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await announcementCollection.deleteOne(query);
      res.send(result);
    });

    // post make announcement
    app.post("/announcements", verifyToken,verifyAdmin, async (req, res) => {
      const body = req.body;
      const result = await announcementCollection.insertOne(body);
      res.send(result);
    });

    // set payment at database api post
    app.post("/payments", verifyToken, async (req, res) => {
      const paymentData = req.body;
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result);
    });

    //get all reported comment
    app.get("/reported-comments", verifyToken,verifyAdmin, async (req, res) => {
      const result = await db.collection("reportCollection").find().toArray();
      res.send(result);
    });

    // delete comment by id
    app.delete("/comments/:id", verifyToken,verifyAdmin, async (req, res) => {
      const commentId = req.params.id;
      const result = await commentCollection.deleteOne({
        _id: new ObjectId(commentId),
      });
      res.send(result);
    });

    // dismiss report by id
    app.delete("/dismiss-report/:id", verifyToken,verifyAdmin, async (req, res) => {
      const reportId = req.params.id;
      const result = await reportCollection.deleteOne({
        _id: new ObjectId(reportId),
      });
      res.send(result);
    });

    // update user badge api
    app.patch("/set-badge", verifyToken, verifyEmail, async (req, res) => {
      const email = req.query.email;
      const { plan } = req.body;
      const filter = { email };
      const updateDoc = {
        $set: {
          badge: "gold",
          plan,
        },
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send(paymentIntent);
    });

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("This is Ziffy");
});

app.listen(port, () => {
  console.log(`Ziffy is running on port ${port}`);
});
