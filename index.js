const express = require('express')
const app = express()
const cors = require('cors')
const morgan = require('morgan')
const jwt = require('jsonwebtoken')
require('dotenv').config()
const port = process.env.PORT || 5000
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY);
const nodemailer = require("nodemailer");

// middleware
const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(morgan('dev'))

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.c4vqagl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

//verify jwt 
const verifyJwt =(req,res,next)=>{
  const authorization = req.headers.authorization
  if(!authorization){
    return res.status(401).send({error:true,message:"Unauthorize Access"})
  }
  const token = authorization.split(' ')[1]
  console.log(token)
  jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{
    if(err){
      return res.status(401).send({error:true,message:"Unauthorize Access"})
    }
    req.decoded = decoded
    next()
  })
}

//send email function
const sendMail = (emailData,emailAddress)=>{
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD
    }
  })
  const mailOptions = {
    from: process.env.EMAIL,
    to: emailAddress,
    subject: emailData.subject,
    html:`<p>${emailData?.message}</p>`
  }
  transporter.sendMail(mailOptions, function(error, info){
    if (error) {
   console.log(error);
    } else {
      console.log('Email sent: ' + info.response);
    }
  })
}

async function run() {
  try {
    const usersCollection = client.db('aircncDb').collection('users')
    const roomsCollection = client.db('aircncDb').collection('rooms')
    const bookingsCollection = client.db('aircncDb').collection('bookings')

    //generate client secret 
    app.post('/create-payment-intent',verifyJwt,async(req,res)=>{
      const {price} = req.body
      console.log(price)
      if(price){
        const amount = parseFloat(price) * 100 // converting dollar in cents
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ['card'],
        })
        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
     
    })

    //generate jwt token
    app.post('/jwt',(req,res)=>{
      const email = req.body
      console.log(email)
      const token = jwt.sign(email,process.env.ACCESS_TOKEN_SECRET,{expiresIn:"1h"})
      res.send({token})
    })

    //save user email and role into the mongodb userCollection
    app.put('/users/:email',async(req,res)=>{
      const email = req.params.email
      const user = req.body
      const query = {email: email }
      const options = {upsert : true}
      const updateDoc = {
        $set : user
      }
      const result = await usersCollection.updateOne(query,updateDoc,options)
      res.send(result)
    })  

    //get user with email
    app.get('/users/:email',async(req,res)=>{
      const email = req.params.email
      const query = {email:email}
      const result = await usersCollection.findOne(query)
      res.send(result)
    })

    //adding rooms into the database
    app.post('/rooms',async(req,res)=>{
      const roomData = req.body;
      const result = await roomsCollection.insertOne(roomData)
      res.send(result)
    })

    //Update a room in database
    app.put('/rooms/:id',verifyJwt, async (req, res) => {
      const room = req.body
      console.log(room)

      const filter = { _id: new ObjectId(req.params.id) }
      const options = { upsert: true }
      const updateDoc = {
        $set: room,
      }
      const result = await roomsCollection.updateOne(filter, updateDoc, options)
      res.send(result)
    })

    // Get All Rooms
    app.get('/rooms',async(req,res)=>{
      const allRooms = await roomsCollection.find().toArray()
      res.send(allRooms)
    })
    
    // Get a Single Room
    app.get('/room/:id',async(req,res)=>{
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await roomsCollection.findOne(query)
      res.send(result)
    })

    //Get rooms (using host email) which host added
    app.get('/rooms/:email',verifyJwt,async(req,res)=>{
      const decodedEmail = req.decoded.email
      // console.log(decodedEmail)
      const email = req.params.email
      if(decodedEmail !== email){
        return res.status(403).send({error:true,message:"Forbidden Access"})
      }
      
      const query = {'host.email':email}
      const result = await roomsCollection.find(query).toArray()
      res.send(result)

    })
    
    //update room Booking status
    app.patch('/rooms/status/:id',async(req,res)=>{
      const id = req.params.id
      const status = req.body.status
      const query = {_id:new ObjectId(id)}
      const updateDoc ={
        $set:{
          booked:status,
        },
      }
      const update = await roomsCollection.updateOne(query,updateDoc)
      res.send(update)
    })

    // Delete a single room
    app.delete('/rooms/:id',async(req,res)=>{
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await roomsCollection.deleteOne(query)
      res.send(result)
    })

    //For booking a single room
    app.post('/bookings',async(req,res)=>{
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking)

      //send confirmation email to guest email account
      sendMail(
        {
          subject: 'Booking Successful!',
          message: `Booking Id: ${result?.insertedId}, TransactionId: ${booking.transactionId}`,
        },
        booking?.guest?.email
      )
      
      //send confirmation email to host email account
      sendMail(
        {
          subject: 'Your room got booked!',
          message: `Booking Id: ${result?.insertedId}, TransactionId: ${booking.transactionId}. Check dashboard for more info`,
        },
        booking?.host
      )
      res.send(result)
    })

    //Getting all the bookings through email
    app.get('/bookings',async(req,res)=>{
      const email= req.query.email
      if(!email){
        res.send([])
      }
      const query = {'guest.email':email}
      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })

    //Getting all the bookings for host
    app.get('/bookings/host',async(req,res)=>{
      const email= req.query.email
      if(!email){
        res.send([])
      }
      const query = {host:email}
      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })

    //Delete a single booking using id
    app.delete('/bookings/:id',async(req,res)=>{
      const id = req.params.id
      const query = {_id:new ObjectId(id)}
      const result = await bookingsCollection.deleteOne(query)
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )

  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('AirCNC Server is running..')
})

app.listen(port, () => {
  console.log(`AirCNC is running on port ${port}`)
})
