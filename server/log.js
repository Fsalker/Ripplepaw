const fs = require("fs")

module.exports = {
    log: msg => {
        let d = new Date()
        let date_now = "[" + d.getFullYear() + "/" + ("0" + d.getMonth()).slice(-2) + "/" +  ("0" + d.getDate()).slice(-2) + " - "+("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2) + ":" + ("0" + d.getSeconds()).slice(-2) + "] "

        console.log(msg)

        let stream = fs.createWriteStream("./server/logs/log.txt", {flags: "a"})
        stream.write(date_now + msg + "\n")
        stream.end()
    }
}