const express = require('express');
const router = express.Router();
const chatCtrl = require('../controllers/chat.controller');

router.post('/', chatCtrl.hacerPregunta);

module.exports = router;