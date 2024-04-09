const express = require('express')
const app = express()
const cors = require('cors')
require('dotenv').config()
const port = process.env.PORT || 5000

// middleware
const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.c4vqagl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const usersCollection = client.db('aircncDb').collection('users')
    const roomsCollection = client.db('aircncDb').collection('rooms')
    const bookingsCollection = client.db('aircncDb').collection('bookings')


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
      console.log(result)
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

    //For booking a single room
    app.post('/bookings',async(req,res)=>{
      const booking = req.body;
      const result = await bookingsCollection.insertOne(booking)
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
