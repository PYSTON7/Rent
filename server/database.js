const { MongoClient } = require('mongodb');

// Updated with your new prent-api user and /prent database path
const uri = "mongodb+srv://prent-api:YOUR_ACTUAL_PASSWORD@cluster0.5ahdu5c.mongodb.net/prent?retryWrites=true&w=majority";
const client = new MongoClient(uri);

async function run() {
  try {
    console.log("Connecting to 'prent' database via hotspot...");
    await client.connect();
    console.log("🚀 Connected successfully to MongoDB Atlas!");
    
    // Test the connection by listing available databases
    const databasesList = await client.db().admin().listDatabases();
    console.log("Your Databases:");
    databasesList.databases.forEach(db => console.log(` - ${db.name}`));
  } catch (err) {
    console.error("❌ Connection error:", err.message);
  } finally {
    await client.close();
  }
}
run();
