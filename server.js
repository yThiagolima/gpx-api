const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb'); // ObjectId IMPORTADO
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

// --- Rota de REGISTRO ---
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
        const usernameInputLower = username.toLowerCase();
        const emailInputLower = email.toLowerCase();

        const existingUser = await usersCollection.findOne({
            $or: [
                { username: usernameInputLower },
                { email: emailInputLower }
            ]
        });

        if (existingUser) {
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
            username: username, 
            email: emailInputLower,
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

// --- Rota de LOGIN ---
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
                { username: loginIdentifierLower }, 
                { email: loginIdentifierLower }
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

// --- Middleware de Autenticação Placeholder ---
const simpleAuthCheck = (req, res, next) => {
    console.log("Middleware simpleAuthCheck: Permitindo acesso (APENAS PARA DESENVOLVIMENTO).");
    next(); 
};

// --- ROTAS DA API PARA A DASHBOARD (MOCKADAS) ---
app.get('/api/dashboard/stats', simpleAuthCheck, async (req, res) => {
    console.log('Requisição recebida em /api/dashboard/stats');
    const mockStats = {
        totalVeiculos: Math.floor(Math.random() * 50) + 5,
        alertasAtivos: Math.floor(Math.random() * 10),
        manutencoesAgendadas: Math.floor(Math.random() * 15)
    };
    res.json(mockStats);
});

app.get('/api/dashboard/recent-activity', simpleAuthCheck, async (req, res) => {
    console.log('Requisição recebida em /api/dashboard/recent-activity');
    const mockActivity = [
        { id: 1, tipo: 'abastecimento', descricao: 'Abastecimento veículo Placa XYZ-1234 (R$ 150,00)', data: new Date(Date.now() - 1 * 60 * 60 * 1000) },
        { id: 2, tipo: 'manutencao', descricao: 'Manutenção preventiva VW Gol (Placa ABC-4321) concluída.', data: new Date(Date.now() - 5 * 60 * 60 * 1000) },
        { id: 3, tipo: 'multa', descricao: 'Nova multa registrada para Ford Ka (Placa QWE-0000).', data: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        { id: 4, tipo: 'checklist', descricao: 'Checklist diário Veículo 05 realizado.', data: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    ];
    res.json(mockActivity);
});

// --- ROTAS DA API PARA VEÍCULOS ---

// GET /api/veiculos - Listar todos os veículos
app.get('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }
    try {
        const veiculosCollection = db.collection('veiculos');
        const veiculos = await veiculosCollection.find({}).sort({ dataCadastro: -1 }).toArray();
        res.status(200).json(veiculos);
    } catch (error) {
        console.error('Erro ao buscar veículos:', error);
        res.status(500).json({ message: 'Erro interno ao tentar buscar veículos.' });
    }
});

// POST /api/veiculos - Cadastrar um novo veículo
app.post('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { 
        placa, marca, modelo, anoFabricacao, anoModelo, cor, 
        chassi, renavam, quilometragemAtual, oleoKm, oleoData, frequenciaChecklist 
    } = req.body;

    if (!placa || !marca || !modelo || !anoFabricacao || !anoModelo || quilometragemAtual === undefined || quilometragemAtual === null) {
        return res.status(400).json({ 
            message: "Campos obrigatórios não preenchidos: Placa, Marca, Modelo, Ano Fabricação, Ano Modelo, Quilometragem Atual." 
        });
    }
    if (typeof quilometragemAtual !== 'number' || quilometragemAtual < 0) {
        return res.status(400).json({ message: "Quilometragem atual inválida." });
    }    
    if (anoFabricacao && (typeof anoFabricacao !== 'number' || anoFabricacao < 1900 || anoFabricacao > new Date().getFullYear() + 2)) {
        return res.status(400).json({ message: "Ano de fabricação inválido." });
    }
    if (anoModelo && (typeof anoModelo !== 'number' || anoModelo < 1900 || anoModelo > new Date().getFullYear() + 2)) {
        return res.status(400).json({ message: "Ano do modelo inválido." });
    }

    try {
        const veiculosCollection = db.collection('veiculos');
        const placaUpper = placa.toUpperCase().replace(/-/g, '');

        const existingVeiculo = await veiculosCollection.findOne({ placa: placaUpper });
        if (existingVeiculo) {
            return res.status(409).json({ message: `Veículo com a placa ${placaUpper} já cadastrado.` });
        }

        const novoVeiculo = {
            placa: placaUpper,
            marca,
            modelo,
            anoFabricacao: parseInt(anoFabricacao),
            anoModelo: parseInt(anoModelo),
            cor: cor || null,
            chassi: chassi || null,
            renavam: renavam || null,
            quilometragemAtual: parseInt(quilometragemAtual),
            manutencaoInfo: {
                proxTrocaOleoKm: oleoKm ? parseInt(oleoKm) : null,
                proxTrocaOleoData: oleoData ? new Date(oleoData) : null,
                frequenciaChecklistDias: frequenciaChecklist ? parseInt(frequenciaChecklist) : null,
                dataProxChecklist: frequenciaChecklist && parseInt(frequenciaChecklist) > 0 ? 
                                   new Date(Date.now() + parseInt(frequenciaChecklist) * 24 * 60 * 60 * 1000) : null
            },
            dataCadastro: new Date(),
        };

        const result = await veiculosCollection.insertOne(novoVeiculo);
        console.log('Novo veículo cadastrado:', novoVeiculo.placa, 'ID:', result.insertedId);
        
        res.status(201).json({ 
            message: 'Veículo cadastrado com sucesso!', 
            veiculo: { id: result.insertedId, ...novoVeiculo } 
        });

    } catch (error) {
        console.error('Erro ao cadastrar veículo:', error);
        if (error.code === 11000) {
            return res.status(409).json({ message: `Erro: Dados duplicados (ex: placa ou chassi já existe).` });
        }
        res.status(500).json({ message: 'Erro interno ao tentar cadastrar veículo.' });
    }
});

// DELETE /api/veiculos/:id - Excluir um veículo
app.delete('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "ID de veículo inválido." });
    }

    try {
        const veiculosCollection = db.collection('veiculos');
        const result = await veiculosCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            console.log('Tentativa de exclusão: Veículo com ID não encontrado ->', id);
            return res.status(404).json({ message: "Veículo não encontrado para exclusão." });
        }

        console.log('Veículo excluído com sucesso. ID:', id);
        res.status(200).json({ message: "Veículo excluído com sucesso.", id: id });

    } catch (error) {
        console.error('Erro ao excluir veículo:', error);
        res.status(500).json({ message: 'Erro interno ao tentar excluir veículo.' });
    }
});

// GET /api/veiculos/:id - Buscar um veículo específico pelo ID
app.get('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "ID de veículo inválido." });
    }

    try {
        const veiculosCollection = db.collection('veiculos');
        const veiculo = await veiculosCollection.findOne({ _id: new ObjectId(id) });

        if (!veiculo) {
            console.log('Busca de detalhes: Veículo com ID não encontrado ->', id);
            return res.status(404).json({ message: "Veículo não encontrado." });
        }

        console.log('Detalhes do veículo buscado com sucesso. ID:', id);
        res.status(200).json(veiculo);

    } catch (error) {
        console.error('Erro ao buscar detalhes do veículo:', error);
        res.status(500).json({ message: 'Erro interno ao tentar buscar detalhes do veículo.' });
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
