const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração do MongoDB ---
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("ERRO FATAL: MONGODB_URI não está definida nas variáveis de ambiente.");
    process.exit(1);
}

const client = new MongoClient(mongoUri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("GPX7_DB"); // Certifique-se que "GPX7_DB" é o nome do seu banco na URI
        console.log("Conectado com sucesso ao MongoDB! 🥭");
    } catch (err) {
        console.error("Falha ao conectar com o MongoDB ❌", err);
        process.exit(1);
    }
}

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Rotas ---
app.get('/', (req, res) => {
    res.send('🎉 Backend GPX7 v2 está funcionando e conectado ao MongoDB! 🎉');
});

// --- Rota de REGISTRO (CORRIGIDA) ---
app.post('/register', async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { username, email, password } = req.body;

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
        const usernameInputLower = username.toLowerCase(); // Input do usuário em minúsculas
        const emailInputLower = email.toLowerCase();     // Input do usuário em minúsculas

        // Verifica se o username OU email já existem
        // Assumindo que 'username' e 'email' no DB são armazenados de forma consistente
        // (ex: email sempre minúsculo, username pode ser case-sensitive ou insensitive dependendo da sua regra de negócio ao salvar)
        // Para esta verificação, vamos procurar por correspondências exatas (após normalizar o input)
        // Se você salva 'username' no DB mantendo o case original, mas quer que a checagem seja case-insensitive,
        // a query com RegExp `$options: 'i'` seria melhor para o campo username no findOne.
        // Mas para simplificar e garantir consistência, é bom salvar e checar username em minúsculas.
        const existingUser = await usersCollection.findOne({
            $or: [
                { username: usernameInputLower }, // Busca pelo username em minúsculas
                { email: emailInputLower }      // Busca pelo email em minúsculas
            ]
        });

        if (existingUser) {
            // Se encontrou um usuário, verificamos qual campo coincidiu
            // Assumindo que no DB 'username' e 'email' são armazenados de forma consistente (ex: ambos minúsculos)
            if (existingUser.username === usernameInputLower) {
                return res.status(409).json({ message: 'Este nome de usuário já está em uso.' });
            }
            if (existingUser.email === emailInputLower) {
                return res.status(409).json({ message: 'Este email já está cadastrado.' });
            }
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = {
            username: username, // Você pode optar por salvar username.toLowerCase() para consistência total
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

// --- Rota de LOGIN (Atualizada para usar DB) ---
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
        
        // Procura pelo usuário por username (comparando com o valor salvo, que pode ser case-sensitive ou não)
        // OU por email (comparando com o email salvo, que é sempre minúsculo)
        const user = await usersCollection.findOne({
            $or: [
                // Se o username no DB é salvo com case original, mas você quer permitir login case-insensitive para username:
                // { username: new RegExp(`^${loginIdentifier}$`, 'i') },
                // Se o username no DB é salvo em minúsculas (recomendado para login case-insensitive):
                { username: loginIdentifierLower }, 
                { email: loginIdentifierLower } // Email no DB é sempre minúsculo
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
        });

    } catch (error) {
        console.error('Erro durante o login:', error);
        res.status(500).json({ message: 'Erro interno ao tentar fazer login.' });
    }
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

startServer();
