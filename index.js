require('dotenv').config();
const express = require('express')
const app = express()
const cors = require("cors")
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = 3000

// midleware 
app.use(cors({
    origin:["http://localhost:5173"],
    credentials:true ,
}))
app.use(express.json())
app.use(cookieParser());


// verify token 
const verifyToken = (req , res , next)=>{
    const token = req.cookies.token ;
    if(!token){
        return res.status(401).send({message : "Unauthorized"})
    }
    jwt.verify(token , process.env.JWT_SECRET , (err , decoded)=>{
        if(err){
            return res.status(401).send({message : "Unauthorized"})
        }
        req.decoded = decoded ;
        next()
    })
}

const verifyEmail = (req , res , next)=>{
    const email = req.email ;
    if(req.decoded.email !== email){
        return res.status(403).send({message : "Forbidden access"})
    }
    next()
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vlrcl7k.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
 
    await client.connect();

    const db = client.db("ziffyData");
    const userCollection =  db.collection("userCollection");
    const postCollection = db.collection("postCollection")

 
    // jwt token create and set to cookie
    app.post("/jwt", async(req , res)=>{
        const {email} = req.body ;
        const token = jwt.sign({ email}, process.env.JWT_SECRET , {expiresIn : "365d"})
       
        res.cookie('token', token ,{
            httpOnly:true ,
            secure:false
        }).send({success : true})
        
    })

    // jwt token clear from cookie 
    app.post("/logout", async(req , res)=>{
        res.clearCookie('token',{
            httpOnly: true ,
            secure:false
        })
        res.send({message : "logged out successfully"})
    })

    // users post 
    app.post("/user", async(req , res)=>{
      const userData = req.body ;
      userData.created_at = new Date().toISOString();
      userData.role = "user";
      const existingUser = await userCollection.findOne({email : userData?.email});
      if(existingUser){
        return res.send({message : "User Already Exist"})
      }
      const result = await userCollection.insertOne(userData);
      res.send(result)
    })

    // all-post get method 
    app.get("/all-post",verifyToken, async(req , res)=>{
      const result = await postCollection.find().sort({created_at : -1}).toArray();
      res.send(result)
    })


    // sigle post get method
    app.get("/post-details/:id", async(req , res)=>{
      const id = req.params.id ;
      const filter = {_id : new ObjectId(id)}
      const result = await postCollection.findOne(filter);
      res.send(result)
    })

    // add post post method 
    app.post("/post", async(req , res)=>{
      const postData = req.body ;
      postData.created_at = new Date().toISOString();
      const result = await postCollection.insertOne(postData);
      res.send(result)
    })


    // payment intent 

    app.post("/create-payment-intent", async(req , res)=>{
      const {amount} = req.body ;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount * 100 ,
        currency : "usd",
        payment_method_types: ["card"],
      });
      res.send(paymentIntent)
    })


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('This is Ziffy')
})

app.listen(port, () => {
  console.log(`Ziffy is running on port ${port}`)
})
