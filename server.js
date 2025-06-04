const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb'); // Importa o MongoClient
const bcrypt = require('bcryptjs'); // Importa o bcryptjs

const app = express();
const PORT = process.env.PORT || 3000;

// --- Configuração do MongoDB ---
const mongoUri = process.env.MONGODB_URI; // Pega a URI do ambiente
if (!mongoUri) {
    console.error("ERRO FATAL: MONGODB_URI não está definida nas variáveis de ambiente.");
    process.exit(1); // Encerra o processo se a URI não estiver definida
}

const client = new MongoClient(mongoUri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

let db; // Variável para armazenar a instância do banco de dados

// Função para conectar ao MongoDB
async function connectDB() {
    try {
        await client.connect();
        // Lembre-se de usar o nome do banco de dados que você definiu na sua MONGODB_URI
        // Ex: mongodb+srv://user:pass@cluster.mongodb.net/GPX7_DB -> client.db("GPX7_DB")
        db = client.db("GPX7_DB"); 
        console.log("Conectado com sucesso ao MongoDB!");
    } catch (err) {
        console.error("Falha ao conectar com o MongoDB", err);
        process.exit(1); // Encerra o processo se não conseguir conectar
    }
}

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Rotas ---
app.get('/', (req, res) => {
    res.send('🎉 Backend GPX7 está funcionando e conectado ao MongoDB (esperamos)! 🎉');
});

// --- Rota de REGISTRO ---
app.post('/register', async (req, res) => {
    if (!db) { // Verifica se a conexão com o DB existe
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { email, password } = req.body;

    // Validação básica
    if (!email || !password) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios.' });
    }
    if (password.length < 6) { // Exemplo de regra de senha
        return res.status(400).json({ message: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    try {
        const usersCollection = db.collection('users'); // Pega a coleção 'users'

        // Verifica se o usuário já existe
        const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({ message: 'Este email já está cadastrado.' }); // 409 Conflict
        }

        // Hash da senha
        const saltRounds = 10; // Número de "salt rounds" para o bcrypt
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insere o novo usuário no banco
        const newUser = {
            email: email.toLowerCase(), // Salva email em minúsculas para consistência
            password: hashedPassword,
            createdAt: new Date()
        };
        const result = await usersCollection.insertOne(newUser);

        console.log('Novo usuário registrado:', newUser.email, 'ID:', result.insertedId);
        res.status(201).json({ message: 'Usuário registrado com sucesso!', userId: result.insertedId }); // 201 Created

    } catch (error) {
        console.error('Erro ao registrar usuário:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar usuário.' });
    }
});


// --- Rota de LOGIN (ainda com mock, vamos alterar depois) ---
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    console.log('Tentativa de login recebida no backend:');
    console.log('Email:', email);
    console.log('Senha:', password);

    if (!email || !password) {
        return res.status(400).json({ message: 'Email e senha são obrigatórios!' });
    }

    // Lembre-se que este é o mock user, não está vindo do banco ainda.
    const mockUserEmail = 'usuario@gpx7.com';
    const mockUserPassword = 'senha123';

    if (email === mockUserEmail && password === mockUserPassword) {
        console.log('Login bem-sucedido para (mock user):', email);
        res.status(200).json({
            message: 'Login bem-sucedido!',
            user: {
                email: mockUserEmail,
                name: 'Usuário GPX7 Teste'
            }
        });
    } else {
        // Se não for o mock user, e ainda não implementamos a busca no DB para login,
        // esta mensagem será mostrada para qualquer outra tentativa.
        console.log('Falha no login para:', email, '(não corresponde ao mock user)');
        res.status(401).json({ message: 'Email ou senha inválidos.' });
    }
});

// --- Iniciar o servidor APÓS conectar ao DB ---
async function startServer() {
    await connectDB(); // Garante que o DB conectou antes de subir o servidor
    app.listen(PORT, () => {
        console.log(`Servidor backend GPX7 rodando na porta ${PORT}`);
        if (process.env.NODE_ENV !== 'production') {
            console.log(`Acesse em http://localhost:${PORT}`);
        }
    });
}

startServer(); // Chama a função para iniciar
