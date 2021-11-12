/**
* Jimmy Martini 23-09-2021
* Fichier: index.js
* Route de la page index.ejs
* Prend la demande de page, traite les données si necessaire et affiche la page à afficher.
**/

/* Références necessaire à ce fichier */
var express = require('express');
var router = express.Router();
var connection = require('../manageDb');
var axios = require('axios').default;

/* Variable globales */
var BDD;
var username;
var password;

/* GET Page de connection. */
router.get('/', function(req, res, next) {
  res.render('./pages/index', { title: 'Express', messageErreur: "" });
});

/* GET Page d'informations de contacte. */
router.get('/contact', function(req, res, next) {
  res.render('./pages/contact', { title: 'Contact', user: username });
});

/* GET Déconnection de l'utilisateur et redirection vers / . */
router.get('/logout', function(req, res, next) {
  username = "";
  password = "";
  console.log("Déconnection réussie.");
  res.redirect("/");
});

/* POST Page d'accueil de l'utilisateur. */
router.post('/accueil', function(req, res, next) {
  // Met à jour BDD.
  readDb().then(
    async function(myDb) {
      // Store le résultat de readDb dans la variable globale.
      BDD = myDb;
      if ((username == "") || (typeof username == 'undefined')) {
        username = req.body.username;
        password = req.body.password;
      }
      console.log("Tentative de connection: "+username+" MdP: "+password+"...");
      var userCheck = await checkUser(BDD, username);
      return userCheck;
    },
    function(error) {
      return Promise.reject(error);
  })
  .then(
    async function(userId) {
      var pwdCheck = await checkUserPassword(BDD, userId-1, password);
      return pwdCheck;
    },
    function(error) {
      return Promise.reject(error);
  })
  .then(
    function(userId) {
      console.log("Connection réussi!");
      res.render('./pages/accueil', { title: 'Accueil', myDb: BDD, user: userId });
    },
    function(error) {
      console.log("Erreur /accueil :");
      console.log(error);
      if ( (error[0] == '1') || (error[0] == '2')) {
        /* Remise à zéro de la session et redirection vers "/" avec un message d'erreur. */
        username = "";
        password = "";
        res.render('./pages/index', { title: 'Express', messageErreur: "Erreur: Nom d'utilisateur ou mot de passe incorrect!" });
      } else if (error[0] == '3') {
        /* Redirige sur accueil pour revérifier si la Banque de donnée est définie. */
        res.render('./pages/index', { title: 'Express', messageErreur: "Erreur: Probléme de lecture de la banque de donnée!" });
      } else {
        /* Remise à zéro de la session et redirection vers "/" avec un message d'erreur. */
        username = "";
        password = "";
        res.render('./pages/index', { title: 'Express', messageErreur: "Erreur: Erreur inattendu!" });
      }
  })
  .catch(function (err) {
    console.log("Catch /accueil : ");
    console.log(err);
  });
});

/* POST Mise à jour de la banque de donnée demander par l'utilisateur. */
router.post('/update', function(req, res, next) {
  var data = req.body.data;
  var target = req.body.target;
  var userId = req.body.userId;
  /* Requète UPDATE et redirection vers /accueil en POST (307). */
  modifyDb(data, target, userId).then(
    function(value) {
      if( target == "password") {
        /* Mise à jour de mot de passe dans le serveur pour permettre la reconnection à la page /accueil. */
        password = data;
        axios.post('http://localhost:3000/accueil', {
          username: username,
          password: password
        })
        .then(function (response) {
          console.log("Axios response : "+ response.statusText);
          res.redirect(307, "/accueil");
        })
        .catch(function (error) {
          console.log("Axios erreur : ");
          console.log(JSON.stringify(error));
          res.send(error);
        });
      } else {
        res.redirect(307, "/accueil");
      }
    },
    function(error) {
      console.log(error);

      /* Remise à zéro de la session et redirection vers / avec un message d'erreur. */
      username = "";
      password = "";
      res.render('./pages/index', { title: 'Express', messageErreur: "Erreur: Un problème lors de la modification est survenu. Connection fermée." });
    }
  ).catch(function (err) {
    console.log("/update : ");
    console.log(err);
  });
});

/* Fontion qui compare le nom d'utilisateur donnée à ceux contenue dans la banques de donnée */
function checkUser(db, user) {
  for (var i = 0;i <= (db.length-1); i++) {
      if ( (db[i].login) == user) {
        return Promise.resolve(db[i].id);
      }
  }
  return Promise.reject("1 Erreur: Utilisateur '"+user+"' n'existe pas");
}

/* Fontion qui compare le mot de passe donnée à celui associé à l'utilisateur spécifié. */
function checkUserPassword(db, id, password) {
  if ( (db[id].password) == password) {
    return Promise.resolve(db[id].id);
  } else {
    return Promise.reject("2 Erreur : Mot de passe incorrecte!");
  }
}

/* Fonction qui met à jour la banque de donnée */
async function readDb() {
  var querystring = 'SELECT * FROM login';
    var readPromise = await new Promise((resolve, reject) => {
      var query = connection.query(querystring, function(err, rows, fields) {
        if (!err) {
          console.log("Ma requête SELECT est passée !");
          resolve(JSON.parse(JSON.stringify(rows)));
        } else {
          reject("3 Erreur readDb : "+err);
        };
      });
    });
  return readPromise;
}

/* Fonction qui fait la requète SQL qui met à jour la donnée spécifié pour l'utilisateur spécifier (UPDATE) */
async function modifyDb(data, target, userId) {
  var querystring = 'UPDATE login SET ';
  if (target == "message") {
    querystring += "texteAccueil = '"+data+"' ";
    /* Changement de target pour la construction du console.log dans updateDb(). */
    target = "Texte d'accueil : ";
  } else if (target == "password"){
    querystring += "password = '"+data+"' ";
    /* Changement de target pour la construction du console.log dans updateDb(). */
    target = "MdP : ";
  }
  querystring += "WHERE id = "+userId+";";

  var updatePromise = await new Promise((resolve, reject) => {
    var query = connection.query(querystring, async function(err, rows, fields) {
      if (!err) {
        console.log("Requète UPDATE: "+username+" => "+target+data+" est passé!");
        resolve(JSON.parse(JSON.stringify(rows)));
      } else {
        reject("4 Erreur update : "+JSON.stringify(err));
      };
    });
  }); 
  return updatePromise;
}

module.exports = router;