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
            username: username, // Mantém o case original para exibição, mas busca por minúsculo
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
                { username: { $regex: new RegExp(`^${loginIdentifierLower}$`, 'i') } }, // Case-insensitive username search
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
                username: user.username, // Retorna o username com o case original
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
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const totalVeiculos = await db.collection('veiculos').countDocuments();
        // Lógica para alertas e manutenções agendadas seria mais complexa
        // Por agora, vamos mockar ou simplificar
        const proximasManutencoes = await db.collection('veiculos').find({
            $or: [
                { 'manutencaoInfo.proxTrocaOleoData': { $gte: new Date() } },
                { 'manutencaoInfo.dataProxChecklist': { $gte: new Date() } }
            ]
        }).toArray();
        
        // Contar alertas de KM para troca de óleo (simplificado)
        const veiculosComProxTrocaKm = await db.collection('veiculos').find({
            'manutencaoInfo.proxTrocaOleoKm': { $exists: true, $ne: null }
        }).toArray();

        let alertasKmOleo = 0;
        veiculosComProxTrocaKm.forEach(v => {
            if (v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) {
                alertasKmOleo++;
            }
        });

        const stats = {
            totalVeiculos: totalVeiculos,
            alertasAtivos: proximasManutencoes.length + alertasKmOleo, // Exemplo
            manutencoesAgendadas: proximasManutencoes.length // Exemplo
        };
        res.json(stats);
    } catch (error) {
        console.error("Erro em /api/dashboard/stats:", error);
        res.status(500).json({ message: "Erro ao buscar estatísticas."});
    }
});

app.get('/api/dashboard/recent-activity', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const manutencoesRecentes = await db.collection('manutencoes')
            .find().sort({ dataRealizacao: -1 }).limit(3).toArray();
        const checklistsRecentes = await db.collection('checklists') // Supondo que você tenha uma coleção 'checklists'
            .find().sort({ dataRealizacao: -1 }).limit(2).toArray();
        const abastecimentosRecentes = await db.collection('abastecimentos')
            .find().sort({data: -1}).limit(2).toArray();

        let activities = [];
        manutencoesRecentes.forEach(m => activities.push({
            id: m._id, tipo: 'manutencao',
            descricao: `Manutenção (${m.tipoManutencao || 'Geral'}) veículo ${m.veiculoPlaca || ''}`, data: m.dataRealizacao
        }));
        checklistsRecentes.forEach(c => activities.push({
            id: c._id, tipo: 'checklist',
            descricao: `Checklist veículo ${c.veiculoPlaca || ''} por ${c.realizadoPor || 'N/A'}`, data: c.dataRealizacao
        }));
        abastecimentosRecentes.forEach(a => activities.push({
            id: a._id, tipo: 'abastecimento',
            descricao: `Abastecimento ${a.veiculoPlaca || ''} (${a.litros}L)`, data: a.data
        }));

        activities.sort((a, b) => new Date(b.data) - new Date(a.data));
        activities = activities.slice(0, 5); // Pega as 5 mais recentes no geral

        res.json(activities);
    } catch (error) {
        console.error("Erro em /api/dashboard/recent-activity:", error);
        res.status(500).json({ message: "Erro ao buscar atividades."});
    }
});

// --- ROTAS DA API PARA VEÍCULOS ---
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

app.post('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }
    const {
        placa, marca, modelo, anoFabricacao, anoModelo, cor,
        chassi, renavam, quilometragemAtual, oleoKm, oleoData, frequenciaChecklist
    } = req.body;

    const parsedAnoFabricacao = anoFabricacao ? parseInt(anoFabricacao, 10) : null;
    const parsedAnoModelo = anoModelo ? parseInt(anoModelo, 10) : null;
    const parsedQuilometragemAtual = quilometragemAtual !== undefined && quilometragemAtual !== null ? parseInt(quilometragemAtual, 10) : null;
    const parsedOleoKm = oleoKm ? parseInt(oleoKm, 10) : null;
    const parsedFrequenciaChecklist = frequenciaChecklist ? parseInt(frequenciaChecklist, 10) : null;
    const parsedOleoData = oleoData ? new Date(oleoData) : null;
    const dataProxChecklist = parsedFrequenciaChecklist && parsedFrequenciaChecklist > 0
        ? new Date(new Date().setDate(new Date().getDate() + parsedFrequenciaChecklist))
        : null;

    if (!placa || !marca || !modelo || parsedAnoFabricacao === null || parsedAnoModelo === null || parsedQuilometragemAtual === null) {
        return res.status(400).json({
            message: "Campos obrigatórios não preenchidos: Placa, Marca, Modelo, Ano Fabricação, Ano Modelo, Quilometragem Atual."
        });
    }
    // Add more validations as needed

    try {
        const veiculosCollection = db.collection('veiculos');
        const placaUpper = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

        const existingVeiculo = await veiculosCollection.findOne({ placa: placaUpper });
        if (existingVeiculo) {
            return res.status(409).json({ message: `Veículo com a placa ${placaUpper} já cadastrado.` });
        }

        const novoVeiculo = {
            placa: placaUpper, marca: marca.trim(), modelo: modelo.trim(),
            anoFabricacao: parsedAnoFabricacao, anoModelo: parsedAnoModelo,
            cor: cor ? cor.trim() : null, chassi: chassi ? chassi.trim() : null,
            renavam: renavam ? renavam.trim() : null, quilometragemAtual: parsedQuilometragemAtual,
            manutencaoInfo: {
                proxTrocaOleoKm: parsedOleoKm, proxTrocaOleoData: parsedOleoData,
                frequenciaChecklistDias: parsedFrequenciaChecklist, dataProxChecklist: dataProxChecklist,
                ultimaTrocaOleoKm: null, ultimaTrocaOleoData: null, // Adicionado para melhor controle
                ultimoChecklistData: null // Adicionado para melhor controle
            },
            dataCadastro: new Date(),
        };
        const result = await veiculosCollection.insertOne(novoVeiculo);
        res.status(201).json({
            message: 'Veículo cadastrado com sucesso!',
            veiculo: { _id: result.insertedId, ...novoVeiculo }
        });
    } catch (error) {
        console.error('Erro ao cadastrar veículo:', error);
        res.status(500).json({ message: 'Erro interno ao tentar cadastrar veículo.' });
    }
});

app.delete('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('veiculos').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Veículo não encontrado." });
        // Adicional: Excluir manutenções, checklists e abastecimentos associados a este veículo
        await db.collection('manutencoes').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('checklists').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('abastecimentos').deleteMany({ veiculoId: new ObjectId(id) });
        res.status(200).json({ message: "Veículo e seus registros associados foram excluídos." });
    } catch (error) {
        console.error('Erro ao excluir veículo:', error);
        res.status(500).json({ message: 'Erro ao excluir veículo.' });
    }
});

app.get('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        res.status(200).json(veiculo);
    } catch (error) {
        console.error('Erro ao buscar veículo:', error);
        res.status(500).json({ message: 'Erro ao buscar veículo.' });
    }
});

app.put('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });

    const {
        placa, marca, modelo, anoFabricacao, anoModelo, cor,
        chassi, renavam, quilometragemAtual, oleoKm, oleoData, frequenciaChecklist
    } = req.body;

    const parsedAnoFabricacao = anoFabricacao ? parseInt(anoFabricacao, 10) : null;
    const parsedAnoModelo = anoModelo ? parseInt(anoModelo, 10) : null;
    const parsedQuilometragemAtual = quilometragemAtual !== undefined && quilometragemAtual !== null ? parseInt(quilometragemAtual, 10) : null;
    const parsedOleoKm = oleoKm ? parseInt(oleoKm, 10) : null;
    const parsedFrequenciaChecklist = frequenciaChecklist ? parseInt(frequenciaChecklist, 10) : null;
    const parsedOleoData = oleoData ? new Date(oleoData) : null;
    
    const veiculoAtual = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
    if (!veiculoAtual) return res.status(404).json({ message: "Veículo não encontrado para atualização." });

    let dataProxChecklist = veiculoAtual.manutencaoInfo.dataProxChecklist;
    if (parsedFrequenciaChecklist && parsedFrequenciaChecklist > 0 &&
        (veiculoAtual.manutencaoInfo.frequenciaChecklistDias !== parsedFrequenciaChecklist || !veiculoAtual.manutencaoInfo.dataProxChecklist)
    ) {
        const baseDateForChecklist = veiculoAtual.manutencaoInfo.ultimoChecklistData || new Date();
        dataProxChecklist = new Date(new Date(baseDateForChecklist).setDate(new Date(baseDateForChecklist).getDate() + parsedFrequenciaChecklist));
    }


    if (!placa || !marca || !modelo || parsedAnoFabricacao === null || parsedAnoModelo === null || parsedQuilometragemAtual === null) {
        return res.status(400).json({ message: "Campos obrigatórios devem ser preenchidos." });
    }

    const updatedFields = {
        placa: placa.toUpperCase().replace(/[^A-Z0-9]/g, ''),
        marca: marca.trim(), modelo: modelo.trim(),
        anoFabricacao: parsedAnoFabricacao, anoModelo: parsedAnoModelo,
        cor: cor ? cor.trim() : null, chassi: chassi ? chassi.trim() : null,
        renavam: renavam ? renavam.trim() : null, quilometragemAtual: parsedQuilometragemAtual,
        'manutencaoInfo.proxTrocaOleoKm': parsedOleoKm,
        'manutencaoInfo.proxTrocaOleoData': parsedOleoData,
        'manutencaoInfo.frequenciaChecklistDias': parsedFrequenciaChecklist,
        'manutencaoInfo.dataProxChecklist': dataProxChecklist,
        dataAtualizacao: new Date()
    };
    // Remove campos de manutencaoInfo se não forem fornecidos explicitamente para não sobrescrever com null
    if (oleoKm === null || oleoKm === undefined) delete updatedFields['manutencaoInfo.proxTrocaOleoKm'];
    if (oleoData === null || oleoData === undefined) delete updatedFields['manutencaoInfo.proxTrocaOleoData'];
    if (frequenciaChecklist === null || frequenciaChecklist === undefined) {
        delete updatedFields['manutencaoInfo.frequenciaChecklistDias'];
        delete updatedFields['manutencaoInfo.dataProxChecklist'];
    }


    try {
        const veiculosCollection = db.collection('veiculos');
        const existingVeiculoWithSamePlaca = await veiculosCollection.findOne({
            placa: updatedFields.placa,
            _id: { $ne: new ObjectId(id) }
        });
        if (existingVeiculoWithSamePlaca) {
            return res.status(409).json({ message: `Placa ${updatedFields.placa} já em uso.` });
        }

        const result = await veiculosCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedFields }
        );
        if (result.matchedCount === 0) return res.status(404).json({ message: "Veículo não encontrado." });
        res.status(200).json({ message: "Veículo atualizado com sucesso." });
    } catch (error) {
        console.error('Erro ao atualizar veículo:', error);
        res.status(500).json({ message: 'Erro ao atualizar veículo.' });
    }
});

// --- ROTAS DA API PARA MANUTENÇÕES ---
app.get('/api/manutencoes/proximas', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const veiculos = await db.collection('veiculos').find({}).toArray();
        const hoje = new Date();
        hoje.setHours(0,0,0,0);
        const proximas = [];

        veiculos.forEach(v => {
            if (v.manutencaoInfo) {
                // Alerta Troca de Óleo por Data
                if (v.manutencaoInfo.proxTrocaOleoData) {
                    const dataOleo = new Date(v.manutencaoInfo.proxTrocaOleoData);
                    if (dataOleo >= hoje) {
                        proximas.push({
                            _id: v._id.toString() + '_oleoData', veiculoId: v._id.toString(), veiculoPlaca: v.placa,
                            tipo: 'Troca de Óleo',
                            descricao: `Troca de óleo programada para ${dataOleo.toLocaleDateString('pt-BR')}.`,
                            dataPrevista: dataOleo, kmPrevisto: v.manutencaoInfo.proxTrocaOleoKm
                        });
                    }
                }
                // Alerta Troca de Óleo por KM
                if (v.manutencaoInfo.proxTrocaOleoKm && v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) {
                     // Evitar duplicar se já listado por data e a data ainda não passou mas KM sim
                    if (!proximas.find(p => p._id === v._id.toString() + '_oleoData' && new Date(p.dataPrevista) >= hoje)) {
                        proximas.push({
                            _id: v._id.toString() + '_oleoKm', veiculoId: v._id.toString(), veiculoPlaca: v.placa,
                            tipo: 'Troca de Óleo',
                            descricao: `Troca de óleo por KM atingida (${v.quilometragemAtual.toLocaleString('pt-BR')}km de ${v.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')}km).`,
                            dataPrevista: null, // Ou a data atual se quiser forçar uma data
                            kmPrevisto: v.manutencaoInfo.proxTrocaOleoKm,
                            kmAtual: v.quilometragemAtual,
                            alertaKm: true
                        });
                    }
                }
                // Alerta Próximo Checklist
                if (v.manutencaoInfo.dataProxChecklist) {
                    const dataCheck = new Date(v.manutencaoInfo.dataProxChecklist);
                    if (dataCheck >= hoje) {
                        proximas.push({
                            _id: v._id.toString() + '_checklist', veiculoId: v._id.toString(), veiculoPlaca: v.placa,
                            tipo: 'Checklist',
                            descricao: `Checklist periódico para ${dataCheck.toLocaleDateString('pt-BR')}. Frequência: ${v.manutencaoInfo.frequenciaChecklistDias || 'N/A'} dias.`,
                            dataPrevista: dataCheck
                        });
                    }
                }
            }
        });
        proximas.sort((a, b) => (a.dataPrevista || new Date(8640000000000000)) - (b.dataPrevista || new Date(8640000000000000)));
        res.status(200).json(proximas);
    } catch (error) {
        console.error('Erro ao buscar próximas manutenções:', error);
        res.status(500).json({ message: 'Erro ao buscar próximas manutenções.' });
    }
});

app.get('/api/manutencoes/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { search } = req.query;
    try {
        const query = {};
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { veiculoPlaca: searchRegex }, { tipoManutencao: searchRegex }, { descricao: searchRegex }
            ];
        }
        const historico = await db.collection('manutencoes').find(query).sort({ dataRealizacao: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) {
        console.error('Erro ao buscar histórico de manutenções:', error);
        res.status(500).json({ message: 'Erro ao buscar histórico.' });
    }
});

app.post('/api/manutencoes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, veiculoPlaca, tipoManutencao, dataRealizacao, custo, descricao, quilometragem, realizadaPor } = req.body;
    if (!veiculoId || !veiculoPlaca || !tipoManutencao || !dataRealizacao) {
        return res.status(400).json({ message: 'Campos obrigatórios não preenchidos.' });
    }
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });

        const novaManutencao = {
            veiculoId: new ObjectId(veiculoId), veiculoPlaca: veiculoPlaca.toUpperCase().replace(/[^A-Z0-9]/g, ''),
            tipoManutencao: tipoManutencao.trim(), dataRealizacao: new Date(dataRealizacao),
            custo: custo ? parseFloat(custo) : null, descricao: descricao ? descricao.trim() : null,
            quilometragem: quilometragem ? parseInt(quilometragem, 10) : null,
            realizadaPor: realizadaPor ? realizadaPor.trim() : null, dataRegistro: new Date()
        };
        const result = await db.collection('manutencoes').insertOne(novaManutencao);

        // Atualizar dados do veículo se a manutenção for relevante (ex: troca de óleo)
        let updateVeiculoFields = {};
        const kmManutencao = novaManutencao.quilometragem;

        if (kmManutencao && kmManutencao > veiculo.quilometragemAtual) {
             updateVeiculoFields.quilometragemAtual = kmManutencao;
        }

        if (tipoManutencao.toLowerCase().includes('óleo') || tipoManutencao.toLowerCase().includes('oleo')) {
            updateVeiculoFields['manutencaoInfo.ultimaTrocaOleoData'] = novaManutencao.dataRealizacao;
            if (kmManutencao) {
                updateVeiculoFields['manutencaoInfo.ultimaTrocaOleoKm'] = kmManutencao;
            }
            // Recalcular próxima troca se houver padrão (ex: a cada 10.000km ou 6 meses)
            // Essa lógica pode ser mais elaborada, buscando a frequência no cadastro do veículo
            // Exemplo simples: se o veículo tem proxTrocaOleoKm definido, e essa manutenção é uma troca de óleo,
            // você pode querer que o usuário defina a *próxima* através da edição do veículo,
            // ou ter uma regra padrão aqui.
            // Por agora, apenas registra a "última". O usuário ajusta a "próxima" em editar_veiculo.html.
        }
        
        if (Object.keys(updateVeiculoFields).length > 0) {
            await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });
        }

        res.status(201).json({ message: 'Manutenção registrada!', manutencao: { _id: result.insertedId, ...novaManutencao } });
    } catch (error) {
        console.error('Erro ao registrar manutenção:', error);
        res.status(500).json({ message: 'Erro ao registrar manutenção.' });
    }
});

app.delete('/api/manutencoes/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('manutencoes').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Manutenção não encontrada." });
        res.status(200).json({ message: "Manutenção excluída." });
    } catch (error) {
        console.error('Erro ao excluir manutenção:', error);
        res.status(500).json({ message: 'Erro ao excluir manutenção.' });
    }
});


// --- ROTAS DA API PARA CHECKLISTS ---
// (Supondo que você usará 'checklists' como o nome da coleção)

// GET /api/checklists/historico
app.get('/api/checklists/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { search } = req.query;
    try {
        const query = {};
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { veiculoPlaca: searchRegex }, { realizadoPor: searchRegex }, { observacoes: searchRegex }
            ];
        }
        const historico = await db.collection('checklists').find(query).sort({ dataRealizacao: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) {
        console.error('Erro ao buscar histórico de checklists:', error);
        res.status(500).json({ message: 'Erro ao buscar histórico de checklists.' });
    }
});

// POST /api/checklists
app.post('/api/checklists', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, veiculoPlaca, dataRealizacao, quilometragem, realizadoPor, observacoes } = req.body;

    if (!veiculoId || !veiculoPlaca || !dataRealizacao || !quilometragem) {
        return res.status(400).json({ message: 'Campos obrigatórios (veiculo, data, km) não preenchidos.' });
    }
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });

        const novoChecklist = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculoPlaca.toUpperCase().replace(/[^A-Z0-9]/g, ''),
            dataRealizacao: new Date(dataRealizacao),
            quilometragem: parseInt(quilometragem, 10),
            realizadoPor: realizadoPor ? realizadoPor.trim() : null,
            observacoes: observacoes ? observacoes.trim() : null,
            dataRegistro: new Date()
        };
        const result = await db.collection('checklists').insertOne(novoChecklist);

        // Atualizar veículo com data do último checklist e recalcular próximo
        let updateVeiculoFields = {
            'manutencaoInfo.ultimoChecklistData': novoChecklist.dataRealizacao
        };
        if (novoChecklist.quilometragem > veiculo.quilometragemAtual) {
            updateVeiculoFields.quilometragemAtual = novoChecklist.quilometragem;
        }
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freqDias = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freqDias > 0) {
                updateVeiculoFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(novoChecklist.dataRealizacao).setDate(new Date(novoChecklist.dataRealizacao).getDate() + freqDias));
            }
        }
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });

        res.status(201).json({ message: 'Checklist registrado com sucesso!', checklist: { _id: result.insertedId, ...novoChecklist } });
    } catch (error) {
        console.error('Erro ao registrar checklist:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar checklist.' });
    }
});

// DELETE /api/checklists/:id
app.delete('/api/checklists/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('checklists').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Checklist não encontrado." });
        res.status(200).json({ message: "Checklist excluído com sucesso." });
    } catch (error) {
        console.error('Erro ao excluir checklist:', error);
        res.status(500).json({ message: 'Erro ao excluir checklist.' });
    }
});


// --- NOVAS ROTAS DA API PARA ABASTECIMENTOS ---
app.post('/api/abastecimentos', simpleAuthCheck, async (req, res) => {
    if (!db) {
        return res.status(500).json({ message: "Erro interno do servidor: Banco de dados não conectado." });
    }

    const { veiculoId, veiculoPlaca, data, quilometragemAtual, litros, valorPorLitro, custoTotal, posto, observacoes } = req.body;

    // Validação básica
    if (!veiculoId || !data || !quilometragemAtual || !litros || !valorPorLitro) {
        return res.status(400).json({ message: "Campos obrigatórios: Veículo, Data, Quilometragem, Litros e Valor por Litro." });
    }
    if (!ObjectId.isValid(veiculoId)) {
        return res.status(400).json({ message: "ID do veículo inválido." });
    }

    const parsedQuilometragem = parseInt(quilometragemAtual, 10);
    const parsedLitros = parseFloat(litros);
    const parsedValorPorLitro = parseFloat(valorPorLitro);
    let parsedCustoTotal = custoTotal ? parseFloat(custoTotal) : (parsedLitros * parsedValorPorLitro);

    if (isNaN(parsedQuilometragem) || parsedQuilometragem < 0 ||
        isNaN(parsedLitros) || parsedLitros <= 0 ||
        isNaN(parsedValorPorLitro) || parsedValorPorLitro <= 0 ||
        isNaN(parsedCustoTotal) || parsedCustoTotal <= 0) {
        return res.status(400).json({ message: "Valores numéricos inválidos para abastecimento." });
    }

    try {
        const veiculosCollection = db.collection('veiculos');
        const abastecimentosCollection = db.collection('abastecimentos');

        // 1. Buscar o veículo para verificar a quilometragem e pegar informações de manutenção
        const veiculo = await veiculosCollection.findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) {
            return res.status(404).json({ message: "Veículo não encontrado." });
        }
        if (parsedQuilometragem < veiculo.quilometragemAtual) {
            return res.status(400).json({ message: `Quilometragem informada (${parsedQuilometragem.toLocaleString('pt-BR')}km) é menor que a última registrada para o veículo (${veiculo.quilometragemAtual.toLocaleString('pt-BR')}km).` });
        }

        // 2. Salvar o registro de abastecimento
        const novoAbastecimento = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculo.placa, // Pegar a placa do veículo no DB para consistência
            data: new Date(data),
            quilometragemAtual: parsedQuilometragem,
            litros: parsedLitros,
            valorPorLitro: parsedValorPorLitro,
            custoTotal: parsedCustoTotal,
            posto: posto ? posto.trim() : null,
            observacoes: observacoes ? observacoes.trim() : null,
            dataRegistro: new Date()
        };
        const resultAbastecimento = await abastecimentosCollection.insertOne(novoAbastecimento);

        // 3. Atualizar a quilometragem atual do veículo
        await veiculosCollection.updateOne(
            { _id: new ObjectId(veiculoId) },
            { $set: { quilometragemAtual: parsedQuilometragem } }
        );

        // 4. --- LÓGICA DE ALERTA DE ÓLEO ---
        let alertaOleoMsg = null;
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.proxTrocaOleoKm) {
            if (parsedQuilometragem >= veiculo.manutencaoInfo.proxTrocaOleoKm) {
                alertaOleoMsg = `Atenção: Troca de óleo recomendada! KM atual (${parsedQuilometragem.toLocaleString('pt-BR')}km) atingiu ou ultrapassou o limite para troca (${veiculo.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')}km).`;
                console.log(`ALERTA DE ÓLEO para ${veiculo.placa}: ${alertaOleoMsg}`);
            }
        }

        res.status(201).json({
            message: 'Abastecimento registrado com sucesso!',
            abastecimento: { _id: resultAbastecimento.insertedId, ...novoAbastecimento },
            alertaOleo: alertaOleoMsg // Envia a mensagem de alerta (pode ser null)
        });

    } catch (error) {
        console.error('Erro ao registrar abastecimento:', error);
        res.status(500).json({ message: 'Erro interno ao tentar registrar abastecimento.' });
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
