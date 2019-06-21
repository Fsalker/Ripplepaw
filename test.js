let mysql = require("mysql")
let conn = mysql.createPool({host: "localhost", user: "root", password: "", database: "test"})
//conn.connect()
console.log("ok 1")
conn.query("ALTER DATABASE test CHARACTER SET utf8;", (err, res, fields) => {
	if(err) throw err
	console.log(res)
	conn.end()
})
//conn.end()
