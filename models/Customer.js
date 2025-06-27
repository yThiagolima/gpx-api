const mongoose = require('mongoose');

// Define a estrutura (o "schema") de um cliente no banco de dados
const CustomerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'O nome do cliente é obrigatório.'], // 'required' significa que este campo não pode ser vazio
        trim: true // Remove espaços em branco do início e do fim
    },
    cnpj: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'O telefone do cliente é obrigatório.'],
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true // Salva o email sempre em letras minúsculas
    },
    observations: {
        type: String,
        trim: true
    },
}, {
    // Adiciona automaticamente os campos `createdAt` e `updatedAt` em cada documento
    timestamps: true 
});

// Cria e exporta o modelo 'Customer' para que outras partes da nossa API possam usá-lo
module.exports = mongoose.model('Customer', CustomerSchema);
