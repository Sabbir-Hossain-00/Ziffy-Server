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
    origin: ["http://localhost:5173"],
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
  const email = req.email;
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
    await client.connect();

    // collections
    const db = client.db("ziffyData");
    const userCollection = db.collection("userCollection");
    const postCollection = db.collection("postCollection");
    const commentCollection = db.collection("commentCollection");
    const paymentCollection = db.collection("paymentCollection");
    const reportCollection = db.collection("reportCollection")

    // jwt token create and set to cookie
    app.post("/jwt", async (req, res) => {
      const { email } = req.body;
      const token = jwt.sign({ email }, process.env.JWT_SECRET, {
        expiresIn: "365d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false,
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
    app.get("/all-user", async(req , res)=>{
      const result = await userCollection.find().toArray();
      res.send(result)
    })

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
    app.get("/all-post", verifyToken, async (req, res) => {
      const result = await postCollection
        .find()
        .sort({ created_at: -1 })
        .toArray();
      res.send(result);
    });

    // sigle post get method
    app.get("/post-details/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await postCollection.findOne(filter);
      res.send(result);
    });

    // get post by search
    app.get("/search-post", async (req, res) => {
      const searchResult = req.query.tag;
      console.log(searchResult);
      const result = await postCollection
        .find({
          tag: { $regex: searchResult, $options: "i" },
        })
        .toArray();
      res.send(result);
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
    app.get("/my-post", async(req , res)=>{
      const email = req.query.email;
      const filter = {authorEmail : email}
      const result = await postCollection.find(filter).toArray();
      res.send(result)
    })

    // add post post method
    app.post("/post", async (req, res) => {
      const postData = req.body;
      postData.created_at = new Date().toISOString();
      const result = await postCollection.insertOne(postData);
      res.send(result);
    });

    // get comment for individual post
    app.get("/post-comment", async (req, res) => {
      const postId = req.query.id;
      const query = { postId };
      const result = await commentCollection.find(query).toArray();
      res.send(result);
    });

    // comment post method
    app.post("/comment", async (req, res) => {
      const commentData = req.body;
      const result = await commentCollection.insertOne(commentData);
      res.send(result);
    });

    // up vote and down vote patch and total vote count and update postCollection
    // PATCH /vote/:postId
    app.patch("/vote/:id", async (req, res) => {
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
    app.get("/popular-post", async(req , res)=>{
      const result = await postCollection.find().sort({
        totalVote : -1 , created_at: -1
      }).toArray();
      res.send(result)
    });




    // report post api
    app.post("/report",async(req , res)=>{
      const reportData = req.body;
      const result = await reportCollection.insertOne(reportData);
      res.send(result)
    })



    // set payment at database api post
    app.post("/payments", async(req , res)=>{
      const paymentData = req.body ;
      const result = await paymentCollection.insertOne(paymentData)
      res.send(result)
    })

    // update user badge api 
    app.patch("/set-badge", async(req , res)=>{
      const email = req.query.email ;
      const filter = {email}
      const updateDoc = {
        $set :{
          verified : true,
        }
      }
      const result = await userCollection.updateOne(filter , updateDoc);
      res.send(result)
      
    })

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
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
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
