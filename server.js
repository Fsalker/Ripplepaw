'use strict'
var mysql = require("mysql")
var fs = require("fs")
var http = require("http")
var socket = require("socket.io")

const API_HANDLER_FUNCTIONS = require("./server/api.js")
const init_database = require("./server/database.js").init_database
const PORT = 80
const CONNECTION_JSON = require("./server/secrets.js").CONNECTION_JSON
const log = require("./server/log.js").log

const RESETTING_DATABASE = true;

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


        let io = socket(server)
        io.on("connection", (socket) => {
            try{
                let ip = socket.handshake.address
                console.log(`User ${ip} connected`)
                io.emit("swag", Math.random())

                socket.on("disconnect", () => {
                    console.log(`User ${ip} disconnected!`)
                })
            }
            catch(e) {console.log(e)}
        })

        server.listen(PORT)
    })
}

log("Running server...")
main()