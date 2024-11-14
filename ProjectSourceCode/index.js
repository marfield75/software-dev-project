// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server. We'll learn more about it in Part C.
const multer = require('multer');

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
    extname: 'hbs',
    layoutsDir: __dirname + '/views/layouts',
    partialsDir: __dirname + '/views/partials',
});

// database configuration
const dbConfig = {
    host: 'db', // the database server
    port: 5432, // the database port
    database: process.env.POSTGRES_DB, // the database name
    user: process.env.POSTGRES_USER, // the user account to connect with
    password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
       cb(null, path.join(__dirname, '../src/resources/img/')); // Save to the specified folder
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // Unique filename using current timestamp
    }
});

const upload = multer({ storage: storage });

const db = pgp(dbConfig);

// test your database
db.connect()
    .then(obj => {
        console.log('Database connection successful'); // you can view this message in the docker compose logs
        obj.done(); // success, release the connection;
    })
    .catch(error => {
        console.log('ERROR:', error.message || error);
    });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); // specify the usage of JSON for parsing request body.
app.use(express.static('src/resources/img'));
app.use(express.static('src/resources/css'));
// initialize session variables
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        saveUninitialized: false,
        resave: false,
    })
);

app.use(
    bodyParser.urlencoded({
        extended: true,
    })
);

// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************
app.get('/welcome', (req, res) => {
    res.json({status: 'success', message: 'Welcome!'});
  });

app.get('/', (req, res) => {
    res.redirect('/home');
});

app.get('/login', (req, res) => {
    res.render('pages/login');
});

app.get('/register', (req, res) => {
    res.render('pages/register');
});

app.get('/register2', (req, res) => {
    res.render('pages/register2');
});

app.get('/payment', (req, res) => {
    res.render('pages/payment');
});



app.get('/home', (req, res) => {
    res.render('pages/home');
});

//render profile page
app.get('/profile', async (req, res) => {
    res.render('pages/profile')
    /*try {
        const username = req.user.username;
        const userData = await getUserData(username);

        res.render('profile', { user: userData });
    } catch (error) {
        res.status(500).send('Error retrieving profile information');
    }*/
});

app.get('/editProfile', (req, res) => {
    res.render('pages/editProfile')
});
//get username for profile page
async function getUserData(username) {
    try {
        // Define the query to select user data by username
        const query = `
            SELECT username, first_name, last_name, email
            FROM users
            WHERE username = $1
        `;

        // Execute the query and store the result
        const userData = await db.oneOrNone(query, [username]);

        if (!userData) {
            throw new Error('User not found');
        }

        return userData;
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw error;
    }
}

// POST route for handling registration form submission
app.post('/register', async (req, res) => {
    const { 'first-name': firstName, 'last-name': lastName, email, username, password } = req.body;

    if (!firstName || !lastName || !email || !username || !password) {
        return res.render('pages/register', { error: 'All fields are required.' });
    }

    // Log the request body (excluding the password for security)
    const safeBody = { ...req.body };
    delete safeBody.password;
    console.log('Received registration data:', safeBody);

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const query = `
            INSERT INTO users (username, first_name, last_name, password_hash, email) 
            VALUES ($1, $2, $3, $4, $5);
        `;
        const newUser = await db.none(query, [username, firstName, lastName, hashedPassword, email]);
        res.redirect('/login');
    } catch (err) {
        if (err.constraint === 'users_username_key') {
            console.error('Username already exists.');
            res.render('pages/register', { error: 'Username already taken.' });
        } else if (err.constraint === 'users_email_key') {
            console.error('Email already exists.');
            res.render('pages/register', { error: 'Email already registered.' });
        } else {
            console.error('Error during registration:', err);
            res.render('pages/register', { error: 'Registration failed. Please try again.' });
        }
    }
});

app.post('/register2', upload.single('petImage'), async (req, res) => {
    console.log('Received pet registration data:', req.body); // Log the request body
    const { petName, petClass, petAge, petColor,  petWeight, petBreed, petEyecolor, petBirthday, petBio, petLoc } = req.body;
    const petImage = req.file.filename;

    if (!petName || !petClass || !petAge || !petColor || !petWeight || !petBreed || !petEyecolor || !petBirthday || !petBio || !petLoc || !petImage) {
        return res.render('pages/register2', { error: 'All fields are required.' });
    }

    try {
        const imageUrl = `../src/resources/img/${petImage}`;
        const query = `
            INSERT INTO pets (name, class, breed, age, color, weight, birthday, eye_color, location, bio, image_url)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);
        `;
        const newPet = await db.none(query, [petName, petClass, petBreed, petAge, petColor, petWeight, petBirthday, petEyecolor, petLoc, petBio, imageUrl]);
        res.redirect('/profile');
    } catch (err) {
        console.error('Error during pet registration:', err);
        res.render('pages/register2', { error: 'Pet registration failed. Please try again.' });
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Log the incoming request body (excluding the password for security)
    const safeBody = { ...req.body };
    delete safeBody.password;
    console.log('Login request body:', safeBody);

    try {
        const query = 'SELECT * FROM users WHERE username = $1';
        const user = await db.oneOrNone(query, [username]);

        if (!user) {
            console.log('No user found with username:', username);
            return res.render('pages/login', { error: 'Incorrect username or password.' });
        }

        // Log found user details (excluding password for security)
        console.log('User found:', { id: user.id, username: user.username });

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            console.log('Password does not match for user:', username);
            return res.render('pages/login', { error: 'Incorrect username or password.' });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
        };
        await req.session.save();

        res.redirect('/home');
    } catch (err) {
        console.error('Login error:', err);
        res.render('pages/login', { error: 'An error occurred. Please try again.' });
    }
});

app.get('/pet', async (req, res) => {
    const query = 'SELECT * FROM pets LIMIT 1;';
    db.any(query)
        .then(data => {
            res.render('pages/pet', { pet: data[0] });
        })
        .catch(err => {
            console.log(err);
            res.redirect('/home');
        });
});

const auth = (req, res, next) => {
    if (!req.session.user) {
        // Store the original URL to redirect after login
        req.session.redirectAfterLogin = req.originalUrl;
        return res.redirect('/login');
    }
    next();
};

// Authentication Required
app.use(auth);

// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
module.exports = app.listen(3000);
console.log('Server is listening on port 3000');