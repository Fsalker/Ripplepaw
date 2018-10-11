'use strict'
var mysql = require("mysql")
var fs = require("fs")
var http = require("http")
var socket = require("socket.io")
const query = require("./server/utils.js").query

const API_HANDLER_FUNCTIONS = require("./server/api.js")
const init_database = require("./server/database.js").init_database
const PORT = 80
const CONNECTION_JSON = require("./server/secrets.js").CONNECTION_JSON
const log = require("./server/log.js").log

const RESETTING_DATABASE = false;

let con;

function serverHandler(req, res){
    try {
        let url = req.url
        log(`hewwo we have a request from ${req.socket.remoteAddress} for path: ${url}`)
        if(url == "/") url = "/index.html" // Home request

        if(url.indexOf(".") != -1){ // Requesting a file: /image.png, /video.mp4 etc
            let fileName = url.substring(1)

            if(fileName.match(/[^a-zA-Z0-9.\-/]/)) res.end() // dumb request
            else {
                fs.readFile("./public/"+fileName, (err, data) => {
                    if(err) {
                        log(err)
                        res.writeHead(500)
                        res.end()
                    }
                    else res.end(data)
                })
            }
        }
        else{
            let api_name = url.substring(1)
            if(API_HANDLER_FUNCTIONS[api_name]){ // Requesting an API
                let body = [];
                req.on("error", (e) => {throw e})
                req.on("data", chunk => body.push(chunk))
                req.on("end", () => {
                    try{
                        body = Buffer.concat(body).toString()
                        if(body) body = JSON.parse(body)
                        API_HANDLER_FUNCTIONS[api_name](con, res, body).catch(e => {
                            log(e)
                            res.writeHead(500)
                            res.end()
                        })
                    }
                    catch(e){
                        log(e)
                        res.writeHead(500)
                        res.end()
                    }
                })
            }
            else res.end() // dumb request
        }        
    }
    catch(err){ 
        res.writeHead(500)
        res.end()
        log(err)
    }
}

function main(){
    let server = http.createServer(serverHandler)
    con = mysql.createPool(CONNECTION_JSON)

    log("Connecting to DB...")
    con.getConnection(async(err) => {
        if(err) {
            console.log(err)
            return
        }

        log("Connected to DB!")

        if(RESETTING_DATABASE)
            await init_database(con)

        function validate_socket_auth(con, data){
            return new Promise( async(resolve, reject) => {
                if((await query(con, "SELECT COUNT(*) FROM Sessions WHERE userId = ? AND hash = ?", [data.userId, data.hash]))[0]["COUNT(*)"] == 0) throw "Bad auth (socket)"
                if((await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId]))[0]["COUNT(*)"] == 0) throw "User is not in room (socket)"

                resolve()
            })
        }

        let io = socket(server)
        io.on("connection", (socket) => {
            try{
                let ip = socket.handshake.address
                console.log(`User ${ip} connected`)

                socket.on("disconnect", () => {
                    console.log(`User ${ip} disconnected!`)
                })



                // userId, hash, roomId,     (user must already be in that room)
                // --> [{id, word, revealed, _color}]
                // --> if something goes bad, the socket disconnects
                socket.on("get room data", async(data) => {
                    try{
                        await validate_socket_auth(con, data)

                        let users = await query(con, `SELECT a.id, a.nickname, b.role FROM Users a 
                                             JOIN UserToRoom b ON a.id = b.userId
                                             WHERE b.roomId = ?`, data.roomId)

                        let role = users.filter( user => user.id == data.userId)[0].role
                        if(role == undefined) throw "Role is undefined, but I don't know how this is possible!"
                        console.log(role)

                        let words = await query(con, `SELECT a.id, c.word, a.color, a.revealed FROM
                                            (SELECT * FROM WordToRoom WHERE roomId = ?) a
                                            JOIN Words c ON a.wordId = c.id`, data.roomId)

                        if(role.indexOf("spymaster") == -1) // Not a spymaster, so we don't show every word's color
                            for(let word of words)
                                if(word.revealed == "false") // Word isn't revealed, so we hide this color
                                    delete word.color

                        socket.emit("received room data", {users: users, words: words})
                    } catch(e) {
                        log("Failed to get room data: "+e)
                        socket.disconnect()
                    }
                })

                // userId, hash, roomId
                // --> if not ok, disconnects the socket
                socket.on("join room", async(data) => {
                    try{
                        await validate_socket_auth(con, data)
                        socket.join(`room ${data.roomId}`)
                        //socket.join("yolo")
                        log(`User ${data.userId} joined room ${data.roomId}`)
                        socket.emit("joined room")
                    } catch(e) {
                        log("Error when joining room: "+e)
                        socket.disconnect()
                    }
                })

                // userId, hash, roomId, msg
                // --> broadcasts message
                socket.on("message room", async(data) => {
                    try{
                        await validate_socket_auth(con, data)

                        io.to(`room ${data.roomId}`).emit("broadcasting message to room", data.msg)
                        //io.to("yolo").emit("broadcasting message to room", data.msg)
                        log(`User ${data.userId} sent to room ${data.roomId} message: ${data.msg}`)
                    } catch(e) {
                        log("Error when broadcasting message: "+e)
                    }
                })
            }
            catch(e) {console.log(e)}
        })

        server.listen(PORT)
    })
}

log("Running server...")
main()