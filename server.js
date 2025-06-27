// 1. CARREGAR VARIÁVEIS DE AMBIENTE
// Puxa as informações do arquivo .env para a memória
require('dotenv').config();

// 2. IMPORTAR BIBLIOTECAS
const express = require('express'); // Para criar o servidor
const mongoose = require('mongoose'); // Para conectar e falar com o MongoDB
const cors = require('cors');       // Para permitir que o frontend acesse a API

// Importa o arquivo de rotas de clientes (que criaremos em seguida)
const customerRoutes = require('./routes/customers');

// 3. INICIALIZAR O APLICATIVO
const app = express();

// 4. CONFIGURAR MIDDLEWARES (Funcionalidades que rodam em toda requisição)
app.use(cors()); // Habilita o CORS para que seu frontend no GitHub Pages possa fazer requisições
app.use(express.json()); // Habilita o servidor a entender requisições com corpo em formato JSON

// 5. CONECTAR AO BANCO DE DADOS
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("Conexão com o MongoDB estabelecida com sucesso!");
    })
    .catch((err) => {
        console.error("Falha ao conectar com o MongoDB:", err);
        process.exit(1); // Encerra a aplicação se não conseguir conectar ao DB
    });

// 6. ROTAS DA API
// Uma rota de teste simples para verificar se a API está no ar
app.get('/api', (req, res) => {
    res.status(200).json({ message: "API do Sistema de OS está funcionando!" });
});

// Diz ao nosso aplicativo para usar as rotas de clientes para qualquer endereço que comece com /api/customers
app.use('/api/customers', customerRoutes);


// 7. INICIAR O SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta http://localhost:${PORT}`);
});
