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
    process.exit(1);
}
const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});
let db; // Variável para a instância do banco de dados

// Função para conectar ao MongoDB
async function connectDB() {
    try {
        await client.connect();
        db = client.db("GPX7_DB"); // Certifique-se que "GPX7_DB" é o nome do seu banco de dados na URI
        console.log("Conectado com sucesso ao MongoDB! 🥭");
    } catch (err) {
        console.error("Falha ao conectar com o MongoDB ❌", err);
        process.exit(1);
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

    const { username, email, password } = req.body; // Coletamos username, email e password

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
    // Regex simples para validar username (alfanumérico, sem espaços)
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { // Permite letras, números, underscore, ponto, hífen
        return res.status(400).json({ message: 'Nome de usuário deve conter apenas letras, números e os caracteres "_", ".", "-".' });
    }
    // Validação simples de email
    if (!/\S+@\S+\.\S+/.test(email)) {
        return res.status(400).json({ message: 'Formato de email inválido.' });
    }

    try {
        const usersCollection = db.collection('users'); // Acessa a coleção 'users'

        // Verifica se o username OU email já existem (case insensitive)
        const existingUser = await usersCollection.findOne({
            $or: [
                { username: new RegExp(`^${username}$`, 'i') }, // Busca case-insensitive para username
                { email: new RegExp(`^${email}$`, 'i') }      // Busca case-insensitive para email
            ]
        });

        if (existingUser) {
            if (existingUser.username.toLowerCase() === username.toLowerCase()) {
                return res.status(409).json({ message: 'Este nome de usuário já está em uso.' }); // 409 Conflict
            }
            if (existingUser.email.toLowerCase() === email.toLowerCase()) {
                return res.status(409).json({ message: 'Este email já está cadastrado.' }); // 409 Conflict
            }
        }

        // Hash da senha
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Cria o novo usuário
        const newUser = {
            username: username, // Pode optar por salvar em minúsculas: username.toLowerCase()
            email: email.toLowerCase(), // Salva email sempre em minúsculas
            password: hashedPassword,
            createdAt: new Date()
        };
        const result = await usersCollection.insertOne(newUser);

        console.log('Novo usuário registrado:', newUser.username, 'Email:', newUser.email, 'ID:', result.insertedId);
        // Retorna apenas informações não sensíveis do usuário
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

    const { loginIdentifier, password } = req.body; // loginIdentifier pode ser username ou email

    if (!loginIdentifier || !password) {
        return res.status(400).json({ message: 'Identificador de login (usuário/email) e senha são obrigatórios.' });
    }

    try {
        const usersCollection = db.collection('users');
        
        // Procura pelo usuário por username (case insensitive) OU email (case insensitive)
        const user = await usersCollection.findOne({
            $or: [
                { username: new RegExp(`^${loginIdentifier}$`, 'i') },
                { email: new RegExp(`^${loginIdentifier}$`, 'i') }
            ]
        });

        if (!user) {
            console.log('Falha no login: Usuário/Email não encontrado para ->', loginIdentifier);
            return res.status(401).json({ message: 'Credenciais inválidas.' }); // Usuário não encontrado
        }

        // Compara a senha enviada com a senha hasheada no banco
        const isPasswordMatch = await bcrypt.compare(password, user.password);

        if (!isPasswordMatch) {
            console.log('Falha no login: Senha incorreta para ->', user.username);
            return res.status(401).json({ message: 'Credenciais inválidas.' }); // Senha incorreta
        }

        // Login bem-sucedido
        console.log('Login bem-sucedido para:', user.username);
        
        // Por enquanto, não enviaremos JWT, apenas dados básicos do usuário.
        // Em uma etapa futura, aqui você geraria um token JWT:
        // const payload = { userId: user._id, username: user.username };
        // const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
        // res.status(200).json({
        //     message: 'Login bem-sucedido!',
        //     token: token,
        //     user: { id: user._id, username: user.username, email: user.email }
        // });

        res.status(200).json({
            message: 'Login bem-sucedido!',
            user: {
                id: user._id, // ID do MongoDB
                username: user.username,
                email: user.email
            }
        });

    } catch (error) {
        console.error('Erro durante o login:', error);
        res.status(500).json({ message: 'Erro interno ao tentar fazer login.' });
    }
});

// --- Iniciar o servidor APÓS conectar ao DB ---
async function startServer() {
    await connectDB(); // Garante que o DB conectou antes de subir o servidor
    app.listen(PORT, () => {
        console.log(`Servidor backend GPX7 v2 rodando na porta ${PORT} 🚀`);
        if (process.env.NODE_ENV !== 'production' && !process.env.RENDER) { // Evita log do localhost no Render
            console.log(`Acesse localmente em http://localhost:${PORT}`);
        }
    });
}

startServer(); // Chama a função para iniciar o servidor
