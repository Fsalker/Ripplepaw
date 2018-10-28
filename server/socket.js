const log = require("./log.js").log
const query = require("./utils.js").query
const VALID_ROLES = require("./utils.js").VALID_ROLES

async function endGame(con, data, io, winningTeam){
    await query(con, "UPDATE Rooms SET winningTeam = ?, gameStarted='false' WHERE id=?", [winningTeam, data.roomId])
    log(`Sending game over to room ${data.roomId} with winning team = ${winningTeam}`)
    io.to(`room ${data.roomId}`).emit("game over", {winningTeam: winningTeam})
}

async function change_playing_team(con, data, io){ // Passes the turn to the other team.
    let teamColorTurn = (await query(con, "SELECT teamColorTurn FROM Rooms WHERE id=?", data.roomId))[0]["teamColorTurn"]
    let otherTeamColor = teamColorTurn=='red' ? 'blue' : 'red'
    await query(con, "UPDATE Rooms SET teamColorTurn=?, teamRoleTurn='spymaster' WHERE id=?", [otherTeamColor, data.roomId])

    io.to(`room ${data.roomId}`).emit("other team plays now", {otherTeamColor: otherTeamColor})
}

async function validate_socket_auth(con, data){ // Checks that there's a Session with userId & hash and that the user is in a room with userId & roomId
    if((await query(con, "SELECT COUNT(*) FROM Sessions WHERE userId = ? AND hash = ?", [data.userId, data.hash]))[0]["COUNT(*)"] == 0) throw "Bad auth (socket)"
    if((await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId]))[0]["COUNT(*)"] == 0) throw "User is not in room (socket)"
}

async function validate_socket_room_ownership(con, userId, roomId){
    if((await query(con, "SELECT ownerId FROM Rooms WHERE id=?", roomId))[0]["ownerId"] != userId)
        throw "user isn't the room's owner!"
}

async function validate_room_has_two_spymasters_and_players_on_both_teams(con, roomId){
    let r = await query(con, "SELECT DISTINCT role FROM UserToRoom WHERE roomId = ?", roomId)
    let roles = r.map(elem => elem.role)

    if(roles.indexOf("red spymaster") == -1) throw "red spymaster missing"
    if(roles.indexOf("red player") == -1) throw "red player missing"
    if(roles.indexOf("blue spymaster") == -1) throw "blue spymaster missing"
    if(roles.indexOf("blue player") == -1) throw "blue player missing"
}

async function validate_socket_play(con, data){ // validates a player's play - hint, guess, pass turn, ... If the game has started and it's their turn, they may make their play
    if((await query(con, "SELECT gameStarted FROM Rooms WHERE id=?", data.roomId))[0]["gameStarted"] != 'true') throw "game hasn't started yet"
    let userRole = (await query(con, "SELECT role FROM UserToRoom WHERE userId = ? AND roomId = ?", [data.userId, data.roomId]))[0]["role"]
    let r = (await query(con, "SELECT teamColorTurn, teamRoleTurn FROM Rooms WHERE id = ?", data.roomId))[0]
    let teamColorTurn = r["teamColorTurn"]
    let teamRoleTurn = r["teamRoleTurn"]
    let userColor = userRole.split(" ")[0]
    let role = userRole.split(" ")[1]

    if(userColor != teamColorTurn) throw "wrong team sent the play"
    if(role != teamRoleTurn) throw "wrong role has sent the play"
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
    let role = (await query(con, "SELECT role FROM UserToRoom WHERE userId = ? AND roomId = ?", [userId, roomId]))[0]["role"]

    let gameStarted = (await query(con, "SELECT gameStarted FROM Rooms WHERE id=?", roomId))[0]["gameStarted"] == 'true'
    let isSpymaster = role.indexOf("spymaster") != -1
    for(let word of words)
        if(!gameStarted || (!isSpymaster && word.revealed == "false")) // If the game hasn't started, we hide all colors. For now :D. Otherwise, if the player isn't the spymaster, we hide unrevealed words.
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

        io.on("connection", (socket) => {
            try{
                let ip = socket.handshake.address
                log(`User ${ip} connected`)
                log(`id = ${socket.id}`)

                socket.on("disconnect", () => {
                    try {
                        let connection = connections.filter(elem => elem.socket.id == socket.id)
                        connections = connections.filter(elem => elem.socket.id != socket.id) // Eliminate this socket from our stash
                        let roomId = connection[0].roomId
                        refreshUsersInRoom(con, io, roomId)
                        log(`User ${ip} disconnected!`)
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
                        let current_connection = connections.filter(elem => elem.socket.id == socket.id)
                        if(current_connection.length > 0){
                            let current_socket = current_connection[0].socket
                            throw "User is already connected!" // [Fixme?] If a user clicks like 4 times instantly on the join button, they will 1. join 2. get disconnected. but this is practically impossible, is it?

                        }
                        //else console.log("User is free to connect")

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
                        await validate_socket_auth(con, data)

                        let users = await getRoomUsers(con, data.roomId)
                        let words = await getRoomWords(con, data.roomId, data.userId)
                        let room = (await query(con, "SELECT winningTeam, gameStarted, ownerId, boardWidth, boardHeight, gameStarted, teamColorTurn, teamRoleTurn, teamGuessesLeft, hintWord FROM Rooms WHERE id = ?", data.roomId))[0]

                        let res = {}
                        res.users = users
                        res.words = words
                        for(key in room)
                            res[key] = room[key]

                        socket.emit("received room data", res)
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
                        if((await query(con, "SELECT gameStarted FROM Rooms WHERE id=?", data.roomId))[0]["gameStarted"] == 'true') throw "cannot change the role when the game has started"
                        if(VALID_ROLES.indexOf(data.role) == -1) throw "bad role when changing role"

                        if(data.role.indexOf("spymaster") != -1){
                            let roleIsTaken = (await query(con, "SELECT COUNT(*) FROM UserToRoom WHERE roomId=? AND role=?", [data.roomId, data.role]))[0]["COUNT(*)"]
                            if(roleIsTaken != 0)
                                throw "Role is taken!"
                        }

                        await query(con, "UPDATE UserToRoom SET role=? WHERE userId = ? AND roomId = ?", [data.role, data.userId, data.roomId])
                        refreshUsersInRoom(con, io, data.roomId)
                    } catch(e) {log("Error when changing role: "+e)}
                })

                // userId, hash, roomId
                // --> broadcasts game started
                socket.on("start game", async(data) => {
                    try{
                        console.log(`roomId = ${data.roomId}`)
                        await validate_socket_auth(con, data)
                        await validate_socket_room_ownership(con, data.userId, data.roomId)
                        await validate_room_has_two_spymasters_and_players_on_both_teams(con, data.roomId) // [debug] uncomment me for production

                        if((await query(con, "SELECT gameStarted FROM Rooms WHERE id=?", data.roomId))[0]["gameStarted"] == 'true') throw "game is already started"

                        /*let winningTeam = (await query(con, `SELECT winningTeam FROM Rooms WHERE id = ?`, data.roomId))[0]["winningTeam"]
                        if(winningTeam) {
                            console
                            let r = (await query(con, `SELECT language, boardWidth, boardHeight FROM Rooms WHERE id = ?`, data.roomId))[0]
                            await assignWordsToRoom(con, data.roomId, r["language"], r["boardWidth"], r["boardHeight"])
                        }*/

                        let startingTeam = Math.random() > 0.5 ? "red" : "blue"
                        await query(con, "UPDATE Rooms SET winningTeam=NULL, gameStarted='true', teamColorTurn=?, teamRoleTurn='spymaster' WHERE id=?", [startingTeam, data.roomId])

                        io.to(`room ${data.roomId}`).emit("started game", {teamColorTurn: startingTeam})
                        log(`Game has started in room ${data.roomId}`)
                    } catch(e) {log("Error when starting game: "+e)}
                })

                // userId, hash, roomId, maxGuesses, hint
                // --> broadcasts received hint
                socket.on("send hint", async(data) => {
                    try{
                        await validate_socket_auth(con, data)
                        await validate_socket_play(con, data)

                        await query(con, "UPDATE Rooms SET teamRoleTurn='player', teamGuessesLeft = ?, hintWord = ? WHERE id=?", [data.maxGuesses, data.hint, data.roomId])

                        io.to(`room ${data.roomId}`).emit("received hint", {maxGuesses: data.maxGuesses, hint: data.hint})
                        log(`Received hint in room ${roomId}: ${data.hint}, ${data.maxGuesses}`)
                    } catch(e) {log("Error when sending hint: "+e)}
                })

                // userId, hash, roomId, wordId
                // --> broadcasts received guess
                socket.on("send guess", async(data) => {
                    try{
                        await validate_socket_auth(con, data)
                        await validate_socket_play(con, data)

                        let word = (await query(con, "SELECT color, revealed FROM WordToRoom WHERE id=?", data.wordId))[0]
                        if(word.revealed == "true") throw "word is already revealed"

                        await query(con, "UPDATE WordToRoom SET revealed = 'true' WHERE id=?", data.wordId)

                        let teamColorTurn = (await query(con, "SELECT teamColorTurn FROM Rooms WHERE id=?", data.roomId))[0]["teamColorTurn"]
                        let otherTeamColor = teamColorTurn=='red' ? 'blue' : 'red'
                        if(word.color == 'Black'){ // we picked the assasin - game over
                            await endGame(con, data, io, otherTeamColor)
                        }
                        else if(word.color == 'Gray'){ // we picked a civilian, so it's the other team's turn now
                            //await query(con, "UPDATE Rooms SET teamColorTurn=?, teamRoleTurn='spymaster' WHERE id=?", [data.otherTeamColor, data.roomId])
                            await change_playing_team(con, data, io)
                        }
                        else{ // red / blue
                            let wordsLeft = (await query(con, "SELECT COUNT(*) FROM WordToRoom WHERE color = ?", teamColorTurn))[0]["COUNT(*)"]
                            if(wordsLeft == 0)
                                await endGame(teamColorTurn)
                            else{
                                if(word.color.toLowerCase() != teamColorTurn.toLowerCase())
                                    await change_playing_team(con, data, io)
                                else {
                                    await query(con, "UPDATE Rooms SET teamGuessesLeft = teamGuessesLeft - 1 WHERE id = ?", data.roomId)
                                    let guessesLeft = (await query(con, "SELECT teamGuessesLeft FROM Rooms WHERE id=?", data.roomId))[0]["teamGuessesLeft"]
                                    if (guessesLeft == 0) { // We ran out of guesses - it's the other team's turn now
                                        //await query(con, "UPDATE Rooms SET teamColorTurn=?, teamRoleTurn='spymaster' WHERE id=?", [otherTeamColor, data.roomId])
                                        await change_playing_team(con, data, io)
                                    }
                                }
                            }
                        }

                        io.to(`room ${data.roomId}`).emit("received guess", {wordId: data.wordId, color: word.color})
                    } catch(e) {log("Error when sending guess: "+e)}
                })

                // userId, hash, roomId
                // --> broadcasts passed turn
                socket.on("pass turn", async(data) => {
                    try{
                        await validate_socket_auth(con, data)
                        await validate_socket_play(con, data)
                        await change_playing_team(con, data, io)
                    } catch(e) {log("Error when passing turn: "+e)}
                })

                // userId, hash, roomId
                // --> broadcasts words to user, if they're they spymaster and the game has started
                socket.on("receive spymaster words", async(data) => {
                    try{
                        await validate_socket_auth(con, data)
                        if((await query(con, "SELECT role FROM UserToRoom WHERE roomId = ? AND userId = ?", [data.roomId, data.userId]))[0]["role"].indexOf("spymaster") == -1) throw "user isn't the spymaster"
                        let words = await getRoomWords(con, data.roomId, data.userId)

                        socket.emit("received spymaster words", {words: words})
                    } catch(e) {log("Error when sending spymaster words: "+e)}
                })
            }
            catch(e) {log(e)}
        })
    }
}