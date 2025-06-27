// 1. CARREGAR VARIÁVEIS DE AMBIENTE E BIBLIOTECAS
require('dotenv').config();
const express = require('express'); // <--- LINHA CORRIGIDA
const mongoose = require('mongoose');
const cors = require('cors');

// 2. INICIALIZAR O APLICATIVO E CONFIGURAR MIDDLEWARES
const app = express();
app.use(cors());
app.use(express.json());

// 3. CONECTAR AO BANCO DE DADOS
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("Conexão com o MongoDB estabelecida com sucesso!"))
    .catch((err) => {
        console.error("Falha ao conectar com o MongoDB:", err);
        process.exit(1);
    });

// ------------------------------------------------------------------
// 4. DEFINIÇÃO DO MODELO (SCHEMA) DO CLIENTE
// ------------------------------------------------------------------
const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'O nome do cliente é obrigatório.'],
        trim: true
    },
    cnpj: { type: String, trim: true },
    phone: {
        type: String,
        required: [true, 'O telefone do cliente é obrigatório.'],
        trim: true
    },
    email: { type: String, trim: true, lowercase: true },
    observations: { type: String, trim: true },
}, {
    timestamps: true
});

const Customer = mongoose.model('Customer', customerSchema);

// ------------------------------------------------------------------
// 5. ROTAS E LÓGICA DA API
// ------------------------------------------------------------------

// Rota de Teste
app.get('/api', (req, res) => {
    res.status(200).json({ message: "API do Sistema de OS está funcionando!" });
});

// Rota para LISTAR TODOS os clientes (GET)
app.get('/api/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 }); // .sort para trazer os mais recentes primeiro
        res.status(200).json({
            status: 'success',
            results: customers.length,
            data: { customers }
        });
    } catch (err) {
        res.status(404).json({ status: 'fail', message: err.message });
    }
});

// Rota para CADASTRAR UM NOVO cliente (POST)
app.post('/api/customers', async (req, res) => {
    try {
        const newCustomer = await Customer.create(req.body);
        res.status(201).json({
            status: 'success',
            data: { customer: newCustomer }
        });
    } catch (err) {
        res.status(400).json({ status: 'fail', message: "Erro ao cadastrar cliente: " + err.message });
    }
});

// 6. INICIAR O SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta http://localhost:${PORT}`);
});
