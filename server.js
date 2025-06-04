const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken'); // Adicionaremos JWT em uma etapa futura

const app = express();
const PORT = process.env.PORT || 3000;
// const JWT_SECRET = process.env.JWT_SECRET; // Para JWT, em uma etapa futura

// --- Configuração do MongoDB ---
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("ERRO FATAL: MONGODB_URI não está definida nas variáveis de ambiente.");
    process.exit(1); // Encerra o processo se a URI não estiver definida
}

const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});
let db; // Variável para a instância do banco de dados

// Função para conectar ao MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db("GPX7_DB"); // Certifique-se que "GPX7_DB" é o nome do seu banco na URI
        console.log("Conectado com sucesso ao MongoDB! 🥭");
    } catch (err) {
        console.error("Falha ao conectar com o MongoDB ❌", err);
        process.exit(1); // Encerra o processo se não conseguir conectar
    }
}

// --- Middlewares ---
app.use(cors()); // Habilita CORS para todas as origens
app.use(express.json()); // Permite que o servidor entenda requisições com corpo em JSON

// --- Rotas ---
app.get('/', (req, res) => {
    res.send('🎉 Backend GPX7 v2 está funcionando e conectado ao MongoDB! 🎉');
});

// --- Rota de REGISTRO (ATUALIZADA) ---
app.post('/register', async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { username, email, password } = req.body;

    // Validação dos campos recebidos
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'Nome de usuário, email e senha são obrigatórios.' });
    }
    if (username.length < 3) {
        return res.status(400).json({ message: 'Nome de usuário deve ter pelo menos 3 caracteres.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) {
        return res.status(400).json({ message: 'Nome de usuário deve conter apenas letras, números e os caracteres "_", ".", "-".' });
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ message: 'Formato de email inválido.' });
    }

    try {
        const usersCollection = db.collection('users');
        const usernameInputLower = username.toLowerCase();
        const emailInputLower = email.toLowerCase();

        const existingUser = await usersCollection.findOne({
            $or: [
                { username: usernameInputLower },
                { email: emailInputLower }
            ]
        });

        if (existingUser) {
            if (existingUser.username === usernameInputLower) { // Assumindo que username no DB também é salvo/comparado em minúsculas
                return res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
            }
            if (existingUser.email === emailInputLower) { // Email no DB é salvo em minúsculas
                return res.status(409).json({ message: 'Este email já está cadastrado.' });
            }
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = {
            username: username, // Ou usernameInputLower para consistência ao salvar
            email: emailInputLower, // Salva email sempre em minúsculas
            password: hashedPassword,
            createdAt: new Date()
        };
        const result = await usersCollection.insertOne(newUser);

        console.log('Novo usuário registrado:', newUser.username, 'Email:', newUser.email, 'ID:', result.insertedId);
        res.status(201).json({
            message: 'Usuário registrado com sucesso!',
            user: { id: result.insertedId, username: newUser.username, email: newUser.email }
        });

    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar usuário.' });
    }
});

// --- Rota de LOGIN (ATUALIZADA - USA O BANCO DE DADOS) ---
app.post('/login', async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { loginIdentifier, password } = req.body;

    if (!loginIdentifier || !password) {
        return res.status(400).json({ message: 'Identificador de login (usuário/email) e senha são obrigatórios.' });
    }

    try {
        const usersCollection = db.collection('users');
        const loginIdentifierLower = loginIdentifier.toLowerCase();
        
        const user = await usersCollection.findOne({
            $or: [
                { username: loginIdentifierLower }, // Assumindo que username no DB é comparado/salvo em minúsculas para login
                { email: loginIdentifierLower }    // Email no DB é sempre minúsculo
            ]
        });

        if (!user) {
            console.log('Falha no login: Usuário/Email não encontrado para ->', loginIdentifier);
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);

        if (!isPasswordMatch) {
            console.log('Falha no login: Senha incorreta para ->', user.username);
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        console.log('Login bem-sucedido para:', user.username);
        res.status(200).json({
            message: 'Login bem-sucedido!',
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            }
            // Futuramente, adicionaremos o token JWT aqui
            // token: "SEU_TOKEN_JWT_AQUI" 
        });

    } catch (error) {
        console.error('Erro durante o login:', error);
        res.status(500).json({ message: 'Erro interno ao tentar fazer login.' });
    }
});

// --- ROTAS DA API PARA A DASHBOARD (MOCKADAS POR ENQUANTO) ---

// Middleware de autenticação (MUITO SIMPLES - SÓ PARA EXEMPLO, USAREMOS JWT REAL DEPOIS)
const simpleAuthCheck = (req, res, next) => {
    console.log("Middleware simpleAuthCheck: Por enquanto, permitindo acesso sem token (APENAS PARA DESENVOLVIMENTO).");
    // Futuramente, este middleware verificará um token JWT.
    // Por agora, ele permite que a requisição prossiga.
    next(); 
};

// Rota para buscar estatísticas da dashboard
app.get('/api/dashboard/stats', simpleAuthCheck, async (req, res) => {
    console.log('Requisição recebida em /api/dashboard/stats');
    // Futuramente, buscaria dados reais do MongoDB
    const mockStats = {
        totalVeiculos: Math.floor(Math.random() * 50) + 5,
        alertasAtivos: Math.floor(Math.random() * 10),
        manutencoesAgendadas: Math.floor(Math.random() * 15)
    };
    res.json(mockStats);
});

// Rota para buscar atividade recente da dashboard
app.get('/api/dashboard/recent-activity', simpleAuthCheck, async (req, res) => {
    console.log('Requisição recebida em /api/dashboard/recent-activity');
    // Futuramente, buscaria dados reais do MongoDB
    const mockActivity = [
        { id: 1, tipo: 'abastecimento', descricao: 'Abastecimento veículo Placa XYZ-1234 (R$ 150,00)', data: new Date(Date.now() - 1 * 60 * 60 * 1000) },
        { id: 2, tipo: 'manutencao', descricao: 'Manutenção preventiva VW Gol (Placa ABC-4321) concluída.', data: new Date(Date.now() - 5 * 60 * 60 * 1000) },
        { id: 3, tipo: 'multa', descricao: 'Nova multa registrada para Ford Ka (Placa QWE-0000).', data: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        { id: 4, tipo: 'checklist', descricao: 'Checklist diário Veículo 05 realizado.', data: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    ];
    res.json(mockActivity);
});

// --- Iniciar o servidor APÓS conectar ao DB ---
async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Servidor backend GPX7 v2 rodando na porta ${PORT} 🚀`);
        if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) {
            console.log(`Acesse localmente em http://localhost:${PORT}`);
        }
    });
}

startServer(); // Chama a função para iniciar o servidor
