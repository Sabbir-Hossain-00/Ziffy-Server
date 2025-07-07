require('dotenv').config();
const express = require('express')
const app = express()
const cors = require("cors")
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
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
    const token = req.cookies ;
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





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('This is Ziffy')
})

app.listen(port, () => {
  console.log(`Ziffy is running on port ${port}`)
})
