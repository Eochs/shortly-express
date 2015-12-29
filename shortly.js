var express = require('express');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var Promise = require('bluebird');
var expressSession = require('express-session');
var cookieParser = require('cookie-parser');
var util = require('./lib/utility');
var bcrypt = require('bcrypt-nodejs');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

// middleware for authenticating user
app.use(cookieParser());
app.use(expressSession({secret: "tessahatesthemovieelf"})); 



app.get('/', util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/create', util.checkUser,
function(req, res) {
  res.render('index');
});

app.get('/links', util.checkUser,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', util.checkUser,
function(req, res) {
  var uri = req.body.url;
  // console.log('url: ', req.body.url, 'code: ', res.body.code, 'body', req.body);

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        Links.create({
          url: uri,
          title: title,
          base_url: req.headers.origin
        })
        .then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.get('/logout', 
function(req, res) {
  req.session.destroy(function(err){
    if (err) console.log('could not log out ', err);
  });
  res.redirect('/login');
});

app.get('/login', 
function(req, res) {
  res.render('login');
});

app.post('/login',
function(req, res){
  var name = req.body.username;
  var pw = req.body.password;
  if (!name || !pw) {
    res.status(400).send('You need a username nad a password stupid');
  }
  // check if the username is in the db
  User.forge({'name': name})
    .fetch()
    .then(function(user){ // user is model
      console.log(user)
      if (!user) {
        res.status(401).send('No user with the given name. Please sign up.');
      } else {
        // check if the password matches for that user
        bcrypt.compare(pw, user.get('password'), function(err, hashesMatch){
          if (err) {
            console.log('Error matching passwords: ', err);
          } else {
            if (hashesMatch) { // res is true if hashed pw matches hash in db for user
              // everything is good
              req.session.user = user;
              res.redirect('/');
            } else {
              res.status(401).send('Wrong password.');
            }
          }
        });
      }
    });
});

app.get('/signup', 
function(req, res) {
  res.render('signup');
});

app.post('/signup', function(req,res) {
  console.log('in /signup: ', req.body);
  User.forge({
    name: req.body.username,
    password: req.body.password
  })
  .save()
  .then(function(user){
    console.log('setting session, password: ', user.get('password'));
    //res.json({error: false , data :{ name : user.get('name')}})
    req.session.user = user;
    console.log('reqs session: ', req.session.user);
    res.redirect('/');
  })
  .catch(function(err){
    res.status(500).json({error: true , data :{message: err.message}})
  })
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', util.checkUser, function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits')+1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
