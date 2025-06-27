const express = require('express');
const customerController = require('../controllers/customerController'); // Importa o "cérebro"

// Cria um "roteador", um mini-aplicativo para lidar apenas com as rotas de clientes
const router = express.Router();

// Define as rotas para o endereço base ('/') que, no nosso caso, será /api/customers
router
    .route('/')
    .post(customerController.createCustomer)  // Se a requisição for POST, chama a função de criar
    .get(customerController.getAllCustomers); // Se a requisição for GET, chama a função de listar

// Exporta o roteador para que o server.js possa usá-lo
module.exports = router;
