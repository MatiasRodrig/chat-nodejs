import express from "express";
import logger from "morgan";
import { Server } from "socket.io";
import { createServer } from 'node:http'
import dotenv from 'dotenv'
import { createClient } from "@libsql/client";

const app = express();
dotenv.config()
const server = createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {}
})
app.use(logger('dev'))

io.on('connection', async (socket) => {
    console.log('a user has connected!')

    socket.on('disconnect', () => {
        console.log('an user has disconnected')
    })


    // Connect to db

    const db = createClient({
        url: process.env.DATABASE_URL,
        authToken: process.env.DB_TOKEN
    });

    await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`)

    socket.on('chat message', async (msg) => {
        let result
        const username = socket.handshake.auth.username ?? 'anonymous'
        console.log({ username })
        try {
            result = await db.execute({
                sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',
                args: { msg, username }
            })
        } catch (e) {
            console.error(e)
            return
        }

        io.emit('chat message', msg, result.lastInsertRowid.toString(), username)
    })

    if (!socket.recovered) { // <- recuperase los mensajes sin conexión
        try {
            const results = await db.execute({
                sql: 'SELECT id, content, user FROM messages WHERE id > ?',
                args: [socket.handshake.auth.serverOffset ?? 0]
            })

            results.rows.forEach(row => {
                socket.emit('chat message', row.content, row.id.toString(), row.user)
            })
        } catch (e) {
            console.error(e)
        }
    }
})

// Routes

app.get("/", (req, res) => {
    res.sendFile(process.cwd() + "/client/index.html")
});




// Server running

const port = process.env.PORT ?? 3000;


server.listen(port, () => {
    console.log(`Server running on port ${port}`);
})