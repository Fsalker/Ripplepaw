const log = require("./log.js").log
const query = require("./utils.js").query
const VALID_ROLES = require("./utils.js").VALID_ROLES

async function validate_socket_auth(con, data){ // Checks that there's a Session with userId & hash and that the user is in a room with userId & roomId
    if((await query(con, "SELECT COUNT(*) FROM Sessions WHERE userId = ? AND hash = ?", [data.userId, data.hash]))[0]["COUNT(*)"] == 0) throw "Bad auth (socket)"
    if((await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId]))[0]["COUNT(*)"] == 0) throw "User is not in room (socket)"
    /*return new Promise( async(resolve, reject) => {
        if((await query(con, "SELECT COUNT(*) FROM Sessions WHERE userId = ? AND hash = ?", [data.userId, data.hash]))[0]["COUNT(*)"] == 0) reject("Bad auth (socket)")
        if((await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId]))[0]["COUNT(*)"] == 0) reject("User is not in room (socket)")

        resolve()
    })*/
}

async function getRoomUsers(con, roomId){ // Gets a room's users
    //try {
    return await query(con, `SELECT a.id, a.nickname, b.role FROM Users a 
                             JOIN UserToRoom b ON a.id = b.userId
                             WHERE b.roomId = ?`, roomId)
    //} catch(e) {log(e)}
}

async function getRoomWords(con, roomId, userId){ // Gets a room's words. If the role includes "spymaster", we also let them know all colors :D
    //try {
    let words = await query(con, `SELECT a.id, c.word, a.color, a.revealed FROM
                             (SELECT * FROM WordToRoom WHERE roomId = ?) a
                             JOIN Words c ON a.wordId = c.id`, roomId)
    console.log(roomId+" "+userId)
    let role = (await query(con, "SELECT role FROM UserToRoom WHERE userId = ? AND roomId = ?", [userId, roomId]))[0]["role"]

    if(role.indexOf("spymaster") == -1) // Not a spymaster, so we don't show every word's color
        for(let word of words)
            if(word.revealed == "false") // Word isn't revealed, so we hide this color
                delete word.color

    return words
    //} catch(e) {log(e)}
}

async function refreshUsersInRoom(con, io, roomId){ // Lets the clients that joined room 'roomId' know that the users (might) have changed, refreshing the front end
    try{
        let users = await getRoomUsers(con, roomId)
        let roomOwnerId = (await query(con, "SELECT ownerId FROM Rooms WHERE id = ?", roomId))[0]["ownerId"]
        io.to(`room ${roomId}`).emit("users updated", {users: users, roomOwnerId: roomOwnerId})
    } catch(e) {log(e)}
}

module.exports = {
    handleSocket(con, io){
        let connections = [] // {userId, roomId, socketId}

        /*setInterval(() => {
            let x = connections.map(elem => {
                return {userId: elem.userId, roomId: elem.roomId}
            })
            console.log(x)
        }, 4000)*/

        io.on("connection", (socket) => {
            try{
                let ip = socket.handshake.address
                console.log(`User ${ip} connected`)
                console.log(`id = ${socket.id}`)

                socket.on("disconnect", () => {
                    try {
                        let connection = connections.filter(elem => elem.socket.id == socket.id)
                        connections = connections.filter(elem => elem.socket.id != socket.id) // Eliminate this socket from our stash
                        let roomId = connection[0].roomId
                        console.log("roomId = "+roomId)
                        refreshUsersInRoom(con, io, roomId)
                        console.log(`User ${ip} disconnected!`)
                    } catch(e) { log("An error has occurred when socket was disconnected: "+e) }
                })

                // userId, hash, roomId
                // --> if not ok, disconnects the socket
                socket.on("join room", async(data) => {
                    try{
                        let connection = {
                            userId: data.userId,
                            roomId: data.roomId,
                            socket: socket
                        }

                        // Allow only 1 socket pe userId & roomId combo
                        console.log("Checking if the user is alredy connected on socket "+socket.id)
                        let current_connection = connections.filter(elem => elem.socket.id == socket.id)
                        if(current_connection.length > 0){
                            let current_socket = current_connection[0].socket
                            throw "User is already connected!" // [Fixme?] If a user clicks like 4 times instantly on the join button, they will 1. join 2. get disconnected. but this is practically impossible, is it?

                        }
                        else console.log("User is free to connect")

                        await validate_socket_auth(con, data)
                        socket.join(`room ${data.roomId}`)
                        refreshUsersInRoom(con, io, data.roomId)
                        socket.emit("joined room")
                        connections.push(connection)
                        log(`User ${data.userId} joined room ${data.roomId}`)
                    } catch(e) {
                        log("Error when joining room: "+e)
                        socket.disconnect()
                    }
                })

                // userId, hash, roomId,     (user must already be in that room)
                // --> [{id, word, revealed, _color}]
                // --> if something goes bad, the socket disconnects
                socket.on("get room data", async(data) => {
                    try{
                        console.log("Getting room data")
                        await validate_socket_auth(con, data)

                        let users = await getRoomUsers(con, data.roomId)
                        let words = await getRoomWords(con, data.roomId, data.userId)
                        let room = (await query(con, "SELECT ownerId, boardWidth, boardHeight FROM Rooms WHERE id = ?", data.roomId))[0]
                        let boardWidth = room["boardWidth"]
                        let boardHeight = room["boardHeight"]
                        let ownerId = room["ownerId"]

                        socket.emit("received room data", {users: users, words: words, boardWidth: boardWidth, boardHeight: boardHeight, ownerId: room["ownerId"]})
                    } catch(e) {
                        log("Failed to get room data: "+e)
                        socket.disconnect()
                    }
                })

                // userId, hash, roomId, msg
                // --> broadcasts message
                socket.on("message room", async(data) => {
                    try{
                        await validate_socket_auth(con, data)
                        let nick = (await query(con, "SELECT nickname FROM Users WHERE id = ?", data.userId))[0]["nickname"]

                        io.to(`room ${data.roomId}`).emit("broadcasting message to room", {userNickname: nick, msg: data.msg})
                        //io.to("yolo").emit("broadcasting message to room", data.msg)
                        log(`User ${data.userId} sent to room ${data.roomId} message: ${data.msg}`)
                    } catch(e) {
                        log("Error when broadcasting message: "+e)
                    }
                })

                // userId, hash, roomId, role   (role must be in VALID_ROLE)
                // --> broadcasts role changed
                socket.on("change role", async(data) => {
                    try{
                        await validate_socket_auth(con, data)
                        if(VALID_ROLES.indexOf(data.role) == -1) throw "bad role when changing role"

                        if(data.role.indexOf("spymaster") != -1){
                            console.log(data)
                            let roleIsTaken = (await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE roomId=? AND role=?", [data.roomId, data.role]))[0]["COUNT(*)"]
                            console.log(roleIsTaken)
                            if(roleIsTaken != 0)
                                throw "Role is taken!"
                        }

                        await query(con, "UPDATE UserToRoom SET role=? WHERE userId = ? AND roomId = ?", [data.role, data.userId, data.roomId])
                        refreshUsersInRoom(con, io, data.roomId)
                    } catch(e) {log("Error when changing role: "+e)}
                })
            }
            catch(e) {log(e)}
        })
    }
}