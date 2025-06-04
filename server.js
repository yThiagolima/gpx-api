const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    // console.log("Middleware simpleAuthCheck: Permitindo acesso (APENAS PARA DESENVOLVIMENTO).");
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

    // Converte valores para número ou null
    const parsedAnoFabricacao = anoFabricacao ? parseInt(anoFabricacao, 10) : null;
    const parsedAnoModelo = anoModelo ? parseInt(anoModelo, 10) : null;
    const parsedQuilometragemAtual = quilometragemAtual !== undefined && quilometragemAtual !== null ? parseInt(quilometragemAtual, 10) : null;
    const parsedOleoKm = oleoKm ? parseInt(oleoKm, 10) : null;
    const parsedFrequenciaChecklist = frequenciaChecklist ? parseInt(frequenciaChecklist, 10) : null;
    const parsedOleoData = oleoData ? new Date(oleoData) : null;

    // Calcula data do próximo checklist
    const dataProxChecklist = parsedFrequenciaChecklist && parsedFrequenciaChecklist > 0
        ? new Date(Date.now() + parsedFrequenciaChecklist * 24 * 60 * 60 * 1000)
        : null;

    if (!placa || !marca || !modelo || parsedAnoFabricacao === null || parsedAnoModelo === null || parsedQuilometragemAtual === null) {
        return res.status(400).json({
            message: "Campos obrigatórios não preenchidos: Placa, Marca, Modelo, Ano Fabricação, Ano Modelo, Quilometragem Atual."
        });
    }
    if (typeof parsedQuilometragemAtual !== 'number' || parsedQuilometragemAtual < 0) {
        return res.status(400).json({ message: "Quilometragem atual inválida." });
    }
    if (parsedAnoFabricacao && (typeof parsedAnoFabricacao !== 'number' || parsedAnoFabricacao < 1900 || parsedAnoFabricacao > new Date().getFullYear() + 2)) {
        return res.status(400).json({ message: "Ano de fabricação inválido." });
    }
    if (parsedAnoModelo && (typeof parsedAnoModelo !== 'number' || parsedAnoModelo < 1900 || parsedAnoModelo > new Date().getFullYear() + 2)) {
        return res.status(400).json({ message: "Ano do modelo inválido." });
    }

    try {
        const veiculosCollection = db.collection('veiculos');
        const placaUpper = placa.toUpperCase().replace(/[^A-Z0-9]/g, ''); // Remove caracteres não alfanuméricos da placa para padronizar

        const existingVeiculo = await veiculosCollection.findOne({ placa: placaUpper });
        if (existingVeiculo) {
            return res.status(409).json({ message: `Veículo com a placa ${placaUpper} já cadastrado.` });
        }

        const novoVeiculo = {
            placa: placaUpper,
            marca: marca.trim(),
            modelo: modelo.trim(),
            anoFabricacao: parsedAnoFabricacao,
            anoModelo: parsedAnoModelo,
            cor: cor ? cor.trim() : null,
            chassi: chassi ? chassi.trim() : null,
            renavam: renavam ? renavam.trim() : null,
            quilometragemAtual: parsedQuilometragemAtual,
            manutencaoInfo: {
                proxTrocaOleoKm: parsedOleoKm,
                proxTrocaOleoData: parsedOleoData,
                frequenciaChecklistDias: parsedFrequenciaChecklist,
                dataProxChecklist: dataProxChecklist,
            },
            dataCadastro: new Date(),
        };

        const result = await veiculosCollection.insertOne(novoVeiculo);
        console.log('Novo veículo cadastrado:', novoVeiculo.placa, 'ID:', result.insertedId);

        res.status(201).json({
            message: 'Veículo cadastrado com sucesso!',
            veiculo: { _id: result.insertedId, ...novoVeiculo }
        });

    } catch (error) {
        console.error('Erro ao cadastrar veículo:', error);
        if (error.code === 11000) { // Duplication key error
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

// PUT /api/veiculos/:id - Atualizar um veículo existente
app.put('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { id } = req.params;
    const {
        placa, marca, modelo, anoFabricacao, anoModelo, cor,
        chassi, renavam, quilometragemAtual, oleoKm, oleoData, frequenciaChecklist
    } = req.body;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "ID de veículo inválido." });
    }

    // Converte valores para número ou null, igual no POST
    const parsedAnoFabricacao = anoFabricacao ? parseInt(anoFabricacao, 10) : null;
    const parsedAnoModelo = anoModelo ? parseInt(anoModelo, 10) : null;
    const parsedQuilometragemAtual = quilometragemAtual !== undefined && quilometragemAtual !== null ? parseInt(quilometragemAtual, 10) : null;
    const parsedOleoKm = oleoKm ? parseInt(oleoKm, 10) : null;
    const parsedFrequenciaChecklist = frequenciaChecklist ? parseInt(frequenciaChecklist, 10) : null;
    const parsedOleoData = oleoData ? new Date(oleoData) : null;

    // Recalcula data do próximo checklist se a frequência foi alterada ou definida
    const dataProxChecklist = parsedFrequenciaChecklist && parsedFrequenciaChecklist > 0
        ? new Date(Date.now() + parsedFrequenciaChecklist * 24 * 60 * 60 * 1000)
        : null;


    if (!placa || !marca || !modelo || parsedAnoFabricacao === null || parsedAnoModelo === null || parsedQuilometragemAtual === null) {
        return res.status(400).json({
            message: "Campos obrigatórios (Placa, Marca, Modelo, Ano Fabricação, Ano Modelo, Quilometragem Atual) devem ser preenchidos."
        });
    }

    const updatedFields = {
        placa: placa.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        marca: marca.trim(),
        modelo: modelo.trim(),
        anoFabricacao: parsedAnoFabricacao,
        anoModelo: parsedAnoModelo,
        cor: cor ? cor.trim() : null,
        chassi: chassi ? chassi.trim() : null,
        renavam: renavam ? renavam.trim() : null,
        quilometragemAtual: parsedQuilometragemAtual,
        manutencaoInfo: {
            proxTrocaOleoKm: parsedOleoKm,
            proxTrocaOleoData: parsedOleoData,
            frequenciaChecklistDias: parsedFrequenciaChecklist,
            dataProxChecklist: dataProxChecklist // Adicionado no PUT
        },
        dataAtualizacao: new Date()
    };

    try {
        const veiculosCollection = db.collection('veiculos');

        // Verifica se a nova placa já existe em outro veículo
        const existingVeiculoWithSamePlaca = await veiculosCollection.findOne({
            placa: updatedFields.placa,
            _id: { $ne: new ObjectId(id) } // Exclui o veículo atual da busca
        });

        if (existingVeiculoWithSamePlaca) {
            return res.status(409).json({ message: `Veículo com a placa ${updatedFields.placa} já está em uso por outro veículo.` });
        }

        const result = await veiculosCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedFields }
        );

        if (result.matchedCount === 0) {
            console.log('Tentativa de atualização: Veículo com ID não encontrado ->', id);
            return res.status(404).json({ message: "Veículo não encontrado para atualização." });
        }

        console.log('Veículo atualizado com sucesso. ID:', id);
        res.status(200).json({ message: "Veículo atualizado com sucesso." });

    } catch (error) {
        console.error('Erro ao atualizar veículo:', error);
        res.status(500).json({ message: 'Erro interno ao tentar atualizar veículo.' });
    }
});


// --- NOVAS ROTAS DA API PARA MANUTENÇÕES ---

// GET /api/manutencoes/proximas - Listar próximas manutenções/alertas
app.get('/api/manutencoes/proximas', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }
    try {
        const veiculosCollection = db.collection('veiculos');
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); // Considera a partir do início do dia

        // Busca veículos que têm próximas manutenções agendadas por data ou KM,
        // ou onde a frequência de checklist indica um checklist pendente/próximo
        // A lógica de alerta de KM seria mais complexa (quilometragem atual + km para próxima troca)
        // Por simplicidade aqui, focaremos em datas e checklists com data calculada.
        const veiculosComManutencaoInfo = await veiculosCollection.find({
            $or: [
                { 'manutencaoInfo.proxTrocaOleoData': { $gte: hoje } }, // Troca de óleo futura
                { 'manutencaoInfo.dataProxChecklist': { $gte: hoje } } // Checklist futuro
                // Poderíamos adicionar alertas para km aqui se tivéssemos um campo de 'ultimoKmTrocaOleo' no veiculo
            ]
        }).toArray();

        const proximasManutencoes = [];

        for (const v of veiculosComManutencaoInfo) {
            // Próxima Troca de Óleo
            if (v.manutencaoInfo && v.manutencaoInfo.proxTrocaOleoData) {
                const dataOleo = new Date(v.manutencaoInfo.proxTrocaOleoData);
                dataOleo.setHours(0, 0, 0, 0);

                if (dataOleo >= hoje) { // Apenas se a data for futura ou hoje
                    proximasManutencoes.push({
                        _id: v._id.toString() + '_oleo', // ID único para o front-end
                        veiculoId: v._id.toString(),
                        veiculoPlaca: v.placa,
                        tipo: 'Troca de Óleo',
                        descricao: `Próxima troca de óleo prevista para ${dataOleo.toLocaleDateString('pt-BR')}` +
                                   (v.manutencaoInfo.proxTrocaOleoKm ? ` ou ${v.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')} km` : ''),
                        dataPrevista: dataOleo,
                        kmPrevisto: v.manutencaoInfo.proxTrocaOleoKm,
                    });
                }
            }

            // Próximo Checklist
            if (v.manutencaoInfo && v.manutencaoInfo.dataProxChecklist) {
                const dataChecklist = new Date(v.manutencaoInfo.dataProxChecklist);
                dataChecklist.setHours(0, 0, 0, 0);

                if (dataChecklist >= hoje) { // Apenas se a data for futura ou hoje
                    proximasManutencoes.push({
                        _id: v._id.toString() + '_checklist', // ID único para o front-end
                        veiculoId: v._id.toString(),
                        veiculoPlaca: v.placa,
                        tipo: 'Checklist',
                        descricao: `Próximo checklist diário/periódico previsto para ${dataChecklist.toLocaleDateString('pt-BR')}`,
                        dataPrevista: dataChecklist,
                        frequencia: v.manutencaoInfo.frequenciaChecklistDias,
                    });
                }
            }
        }

        // Ordena por data prevista, se existir, para mostrar o mais próximo primeiro
        proximasManutencoes.sort((a, b) => {
            const dateA = a.dataPrevista ? new Date(a.dataPrevista) : new Date(8640000000000000); // Max date
            const dateB = b.dataPrevista ? new Date(b.dataPrevista) : new Date(8640000000000000);
            return dateA.getTime() - dateB.getTime();
        });

        res.status(200).json(proximasManutencoes);
    } catch (error) {
        console.error('Erro ao buscar próximas manutenções:', error);
        res.status(500).json({ message: 'Erro interno ao tentar buscar próximas manutenções.' });
    }
});

// GET /api/manutencoes/historico - Listar histórico de manutenções
app.get('/api/manutencoes/historico', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }
    const { search } = req.query;

    try {
        const manutencoesCollection = db.collection('manutencoes'); // Nova coleção 'manutencoes'
        let query = {};
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query = {
                $or: [
                    { veiculoPlaca: searchRegex },
                    { tipoManutencao: searchRegex },
                    { descricao: searchRegex }
                ]
            };
        }

        // Exemplo de estrutura de um documento na coleção 'manutencoes':
        // {
        //   _id: ObjectId("..."),
        //   veiculoId: ObjectId("..."), // Link para o _id do veículo
        //   veiculoPlaca: "ABC1D23",
        //   tipoManutencao: "Troca de Óleo", // ou "Revisão", "Pneu", "Checklist", etc.
        //   dataRealizacao: new Date(),
        //   custo: 250.00, // Opcional
        //   descricao: "Troca de óleo e filtro de ar.",
        //   quilometragem: 60000, // Quilometragem na data da manutenção
        //   realizadaPor: "Oficina ABC", // Opcional
        //   dataRegistro: new Date() // Data de registro no sistema
        // }
        const historico = await manutencoesCollection.find(query).sort({ dataRealizacao: -1, dataRegistro: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) {
        console.error('Erro ao buscar histórico de manutenções:', error);
        res.status(500).json({ message: 'Erro interno ao tentar buscar histórico de manutenções.' });
    }
});

// POST /api/manutencoes - Adicionar uma nova manutenção (histórico ou agendamento)
app.post('/api/manutencoes', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { veiculoId, veiculoPlaca, tipoManutencao, dataRealizacao, custo, descricao, quilometragem, realizadaPor } = req.body;

    if (!veiculoId || !veiculoPlaca || !tipoManutencao || !dataRealizacao) {
        return res.status(400).json({ message: 'Campos obrigatórios: veiculoId, veiculoPlaca, tipoManutencao e dataRealizacao.' });
    }

    if (!ObjectId.isValid(veiculoId)) {
        return res.status(400).json({ message: "ID do veículo inválido." });
    }

    try {
        const manutencoesCollection = db.collection('manutencoes');
        const veiculosCollection = db.collection('veiculos');

        // Opcional: Verificar se o veiculoId realmente existe
        const veiculoExiste = await veiculosCollection.findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculoExiste) {
            return res.status(404).json({ message: "Veículo não encontrado." });
        }

        const novaManutencao = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculoPlaca.toUpperCase().replace(/[^A-Z0-9]/g, ''),
            tipoManutencao: tipoManutencao.trim(),
            dataRealizacao: new Date(dataRealizacao),
            custo: custo ? parseFloat(custo) : null,
            descricao: descricao ? descricao.trim() : null,
            quilometragem: quilometragem ? parseInt(quilometragem, 10) : null,
            realizadaPor: realizadaPor ? realizadaPor.trim() : null,
            dataRegistro: new Date()
        };

        const result = await manutencoesCollection.insertOne(novaManutencao);

        // Lógica para ATUALIZAR a manutencaoInfo no documento do VEÍCULO após registrar uma manutenção
        // Por exemplo, se for uma troca de óleo, atualize proxTrocaOleoKm e proxTrocaOleoData no veículo
        // Esta lógica é mais complexa e depende das suas regras de negócio.
        // Exemplo simplificado para troca de óleo:
        if (tipoManutencao.toLowerCase().includes('óleo') && quilometragem) {
            // Assumindo que a próxima troca será daqui a X km ou Y tempo.
            // Para ser preciso, você precisaria do KM da última troca e adicionar o intervalo.
            // Ou o frontend envia o 'proxTrocaOleoKm' e 'proxTrocaOleoData' já calculados.
            await veiculosCollection.updateOne(
                { _id: new ObjectId(veiculoId) },
                {
                    $set: {
                        'manutencaoInfo.ultimaTrocaOleoKm': quilometragem,
                        'manutencaoInfo.ultimaTrocaOleoData': new Date(dataRealizacao),
                        // Você precisaria calcular proxTrocaOleoKm e proxTrocaOleoData com base na frequência definida
                        // Ou receber esses dados já calculados do frontend para update.
                        // Exemplo (se a regra for +10.000km da última troca):
                        // 'manutencaoInfo.proxTrocaOleoKm': quilometragem + 10000,
                        // 'manutencaoInfo.proxTrocaOleoData': new Date(new Date(dataRealizacao).setMonth(new Date(dataRealizacao).getMonth() + 6)), // 6 meses
                    }
                }
            );
        }
        // Similar para checklist: se um checklist for realizado, atualize dataProxChecklist

        console.log('Nova manutenção registrada:', novaManutencao.tipoManutencao, 'para veículo:', novaManutencao.veiculoPlaca, 'ID:', result.insertedId);
        res.status(201).json({
            message: 'Manutenção registrada com sucesso!',
            manutencao: { _id: result.insertedId, ...novaManutencao }
        });

    } catch (error) {
        console.error('Erro ao registrar manutenção:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar manutenção.' });
    }
});

// DELETE /api/manutencoes/:id - Excluir uma manutenção
app.delete('/api/manutencoes/:id', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "ID de manutenção inválido." });
    }

    try {
        const manutencoesCollection = db.collection('manutencoes');
        const result = await manutencoesCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
            console.log('Tentativa de exclusão: Manutenção com ID não encontrada ->', id);
            return res.status(404).json({ message: "Manutenção não encontrada para exclusão." });
        }

        console.log('Manutenção excluída com sucesso. ID:', id);
        res.status(200).json({ message: "Manutenção excluída com sucesso.", id: id });

    } catch (error) {
        console.error('Erro ao excluir manutenção:', error);
        res.status(500).json({ message: 'Erro interno ao tentar excluir manutenção.' });
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
