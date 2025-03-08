const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');

const sqlite3 = require('sqlite3').verbose();
const database = new sqlite3.Database(':memory:');

// DATABASE SETUP
database.exec(`
    CREATE TABLE messages (
        id STRING PRIMARY KEY,
        message TEXT
)`);

let uniqueID = 1;


const app = express();
app.use(bodyParser.json());

const port = 3000;

const algorithm = 'aes-256-cbc';
const key = crypto.randomBytes(32);
const iv = crypto.randomBytes(16);

function encrypt(text) {
    let cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return { encryptedData: encrypted.toString('hex') };
}

function decrypt(text) {
    let iv = Buffer.from(text.iv, 'hex');
    let encryptedText = Buffer.from(text.encryptedData, 'hex');
    let decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function getDecryptedMessage(id) {
    return new Promise((resolve, reject) => {
        const query = 'SELECT message FROM messages WHERE id = ?';
        database.get(query, [id], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            if (!row) {
                reject(new Error("Message not found"));
                return;
            }

            try {
                const text = { iv: iv.toString('hex'), encryptedData: row.message };
                const message = decrypt(text);
                resolve(message);
            } catch (error) {
                reject(error);
            }
        });
    });
}


app.post('/send', (req, res) => {
    const { message } = req.body;
    if(!message) {
        return res.status(200).send({message: 'Message is required'});
    }
    if(message.length > 1000) {
        return res.status(200).send({message:'Message is too long'});
    }
    uniqueID++;

    const encryptedMessage = encrypt(message).encryptedData;
    const id = encrypt(uniqueID.toString()).encryptedData;

    const insert = database.prepare('INSERT INTO messages (id, message) VALUES (?, ?)');
    insert.run(id, encryptedMessage, function (err) {
        if (err) {
            return res.status(200).send('Database error');
        }
        res.send({ encryptedId: id });
    });

});

app.get('/receive', (req, res) => {
    const { id } = req.body;
    getDecryptedMessage(id)
        .then((message) => {
            res.send({ message: message });
        })
        .catch(() => {
            res.status(200).send({ message: 'Message not found' });
        });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

