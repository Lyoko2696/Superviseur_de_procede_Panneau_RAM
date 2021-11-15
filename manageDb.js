/**
* Copie du code écris par Nicolas Géraudie.
* Jimmy Martini 01-11-2021
* Fichier: managaDb.js
* Code javascript qui initialise la connection avec un banque de donnée.
* Enregistre les informations de la BDD à utiliser et se connecte à la BDD spécifié ici.
**/

/* Initialisation des informations pour ce connecter à la base de donnée. */
var mysql      =  require('mysql');
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : 'root',
    database : 'panneau_ram'
});

/* Initialise la connection à la banque de donnée. */
connection.connect(function (err) {
    if (err) throw err;
    console.log('Vous êtes connecté à votre BDD.');
});

/* Exporte la variable connection pour qu'elle puisse être utilisé dans les autres pages. */
module.exports = connection;