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
        db = client.db("GPX7_DB");
        console.log("Conectado com sucesso ao MongoDB! 🥭");
    } catch (err) {
        console.error("Falha ao conectar com o MongoDB ❌", err);
        process.exit(1);
    }
}

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Helper para criar query de data ---
function getDateQuery(mes, ano) {
    const query = {};
    if (ano && ano !== 'todos') {
        const year = parseInt(ano);
        let startDate, endDate;
        if (mes && mes !== 'todos') {
            const month = parseInt(mes) - 1; // Meses em JS são 0-indexed
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 1); // Próximo mês, dia 1
        } else {
            startDate = new Date(year, 0, 1); // Início do ano
            endDate = new Date(year + 1, 0, 1); // Início do próximo ano
        }
        query.dateMatch = { $gte: startDate, $lt: endDate }; // Campo a ser usado para match de data (data, dataRealizacao etc)
    }
    return query;
}


// --- Rotas ---
app.get('/', (req, res) => {
    res.send('🎉 Backend GPX7 v2 está funcionando e conectado ao MongoDB! 🎉');
});

// --- Rota de REGISTRO ---
app.post('/register', async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { username, email, password } = req.body;
    // ... (validações)
    if (!username || !email || !password) return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    // ... (outras validações) ...
    try {
        const usersCollection = db.collection('users');
        const usernameInputLower = username.toLowerCase();
        const emailInputLower = email.toLowerCase();
        const existingUser = await usersCollection.findOne({ $or: [{ username: usernameInputLower }, { email: emailInputLower }] });
        if (existingUser) return res.status(409).json({ message: 'Usuário ou email já existe.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { username, email: emailInputLower, password: hashedPassword, createdAt: new Date() };
        const result = await usersCollection.insertOne(newUser);
        res.status(201).json({ message: 'Usuário registrado!', user: { id: result.insertedId, username, email } });
    } catch (error) { res.status(500).json({ message: 'Erro ao registrar.' }); }
});

// --- Rota de LOGIN ---
app.post('/login', async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { loginIdentifier, password } = req.body;
    if (!loginIdentifier || !password) return res.status(400).json({ message: 'Campos obrigatórios.' });
    try {
        const usersCollection = db.collection('users');
        const loginIdentifierLower = loginIdentifier.toLowerCase();
        const user = await usersCollection.findOne({ $or: [{ username: { $regex: new RegExp(`^${loginIdentifierLower}$`, 'i') } }, { email: loginIdentifierLower }] });
        if (!user) return res.status(401).json({ message: 'Credenciais inválidas.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Credenciais inválidas.' });
        res.status(200).json({ message: 'Login bem-sucedido!', user: { id: user._id, username: user.username, email: user.email } });
    } catch (error) { res.status(500).json({ message: 'Erro no login.' }); }
});

const simpleAuthCheck = (req, res, next) => { next(); };

// --- ROTAS DA API PARA A DASHBOARD ---
app.get('/api/dashboard/stats', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const totalVeiculos = await db.collection('veiculos').countDocuments();
        const proximasManutencoesData = await db.collection('veiculos').countDocuments({ $or: [{ 'manutencaoInfo.proxTrocaOleoData': { $gte: new Date() } }, { 'manutencaoInfo.dataProxChecklist': { $gte: new Date() } }] });
        const veiculosComProxTrocaKm = await db.collection('veiculos').find({ 'manutencaoInfo.proxTrocaOleoKm': { $exists: true, $ne: null } }).toArray();
        let alertasKmOleo = 0;
        veiculosComProxTrocaKm.forEach(v => { if (v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) { alertasKmOleo++; } });
        res.json({ totalVeiculos, alertasAtivos: proximasManutencoesData + alertasKmOleo, manutencoesAgendadas: proximasManutencoesData });
    } catch (error) { res.status(500).json({ message: "Erro stats." }); }
});

app.get('/api/dashboard/recent-activity', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const manutencoes = db.collection('manutencoes').find().sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, tipoManutencao: 1, dataRealizacao: 1 }).toArray();
        const checklists = db.collection('checklists').find().sort({ dataRealizacao: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, realizadoPor: 1, dataRealizacao: 1 }).toArray();
        const abastecimentos = db.collection('abastecimentos').find().sort({ data: -1 }).limit(5).project({ _id: 1, veiculoPlaca: 1, litros: 1, data: 1 }).toArray();
        const [manutencoesRecentes, checklistsRecentes, abastecimentosRecentes] = await Promise.all([manutencoes, checklists, abastecimentos]);
        let activities = [];
        manutencoesRecentes.forEach(m => activities.push({ id: m._id, tipo: 'manutencao', descricao: `Manutenção (${m.tipoManutencao || 'Geral'}) ${m.veiculoPlaca || ''}`, data: m.dataRealizacao }));
        checklistsRecentes.forEach(c => activities.push({ id: c._id, tipo: 'checklist', descricao: `Checklist ${c.veiculoPlaca || ''} por ${c.realizadoPor || 'N/A'}`, data: c.dataRealizacao }));
        abastecimentosRecentes.forEach(a => activities.push({ id: a._id, tipo: 'abastecimento', descricao: `Abastecimento ${a.veiculoPlaca || ''} (${a.litros.toFixed(1)}L)`, data: a.data }));
        activities.sort((a, b) => new Date(b.data) - new Date(a.data));
        res.json(activities.slice(0, 5));
    } catch (error) { res.status(500).json({ message: "Erro recent activity." }); }
});


// --- ROTAS DE VEÍCULOS, MANUTENÇÕES, CHECKLISTS, ABASTECIMENTOS (EXISTENTES) ---
// SEU CÓDIGO EXISTENTE PARA ESSAS ROTAS VAI AQUI. MANTENHA-O COMO ESTÁ.
// Vou omitir para brevidade, mas ele deve permanecer no seu arquivo.
// ... (GET /api/veiculos, POST /api/veiculos, etc.)
// ... (GET /api/manutencoes/proximas, POST /api/manutencoes, etc.)
// ... (GET /api/checklists/historico, POST /api/checklists, etc.)
// ... (POST /api/abastecimentos)
// --- ROTAS DA API PARA VEÍCULOS ---
app.get('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const veiculos = await db.collection('veiculos').find({}).sort({ dataCadastro: -1 }).toArray();
        res.status(200).json(veiculos);
    } catch (error) { res.status(500).json({ message: 'Erro ao buscar veículos.' }); }
});
app.post('/api/veiculos', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const d = req.body;
    const p = (v, t) => (v !== undefined && v !== null) ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(v) : v)) : null;
    const novoVeiculo = {
        placa: (d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), marca: (d.marca||'').trim(), modelo: (d.modelo||'').trim(),
        anoFabricacao: p(d.anoFabricacao, 'int'), anoModelo: p(d.anoModelo, 'int'), cor: d.cor ? d.cor.trim() : null,
        chassi: d.chassi ? d.chassi.trim() : null, renavam: d.renavam ? d.renavam.trim() : null,
        quilometragemAtual: p(d.quilometragemAtual, 'int'),
        manutencaoInfo: {
            proxTrocaOleoKm: p(d.oleoKm, 'int'), proxTrocaOleoData: p(d.oleoData, 'date'),
            frequenciaChecklistDias: p(d.frequenciaChecklist, 'int'),
            dataProxChecklist: d.frequenciaChecklist > 0 ? new Date(new Date().setDate(new Date().getDate() + parseInt(d.frequenciaChecklist,10))) : null,
            ultimaTrocaOleoKm: null, ultimaTrocaOleoData: null, ultimoChecklistData: null
        }, dataCadastro: new Date()
    };
    if (!novoVeiculo.placa || !novoVeiculo.marca || !novoVeiculo.modelo || !novoVeiculo.anoFabricacao || !novoVeiculo.anoModelo || novoVeiculo.quilometragemAtual === null)
        return res.status(400).json({ message: "Campos obrigatórios não preenchidos." });
    try {
        if (await db.collection('veiculos').findOne({ placa: novoVeiculo.placa }))
            return res.status(409).json({ message: `Placa ${novoVeiculo.placa} já cadastrada.` });
        const result = await db.collection('veiculos').insertOne(novoVeiculo);
        res.status(201).json({ message: 'Veículo cadastrado!', veiculo: { _id: result.insertedId, ...novoVeiculo } });
    } catch (error) { res.status(500).json({ message: 'Erro ao cadastrar veículo.' }); }
});
// ... (demais rotas de veículos, manutenções, checklists e abastecimentos)
app.delete('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('veiculos').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Veículo não encontrado." });
        await db.collection('manutencoes').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('checklists').deleteMany({ veiculoId: new ObjectId(id) });
        await db.collection('abastecimentos').deleteMany({ veiculoId: new ObjectId(id) });
        res.status(200).json({ message: "Veículo e seus registros associados foram excluídos." });
    } catch (error) { res.status(500).json({ message: 'Erro ao excluir veículo.' }); }
});
app.get('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        res.status(200).json(veiculo);
    } catch (error) { res.status(500).json({ message: 'Erro ao buscar veículo.' }); }
});
app.put('/api/veiculos/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    const d = req.body;
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(v) : v)) : null;

    const veiculoAtual = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
    if (!veiculoAtual) return res.status(404).json({ message: "Veículo não encontrado." });

    const updatedFields = { dataAtualizacao: new Date() };
    if (d.placa) updatedFields.placa = d.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (d.marca) updatedFields.marca = d.marca.trim();
    if (d.modelo) updatedFields.modelo = d.modelo.trim();
    if (d.anoFabricacao) updatedFields.anoFabricacao = p(d.anoFabricacao, 'int');
    if (d.anoModelo) updatedFields.anoModelo = p(d.anoModelo, 'int');
    if (d.cor !== undefined) updatedFields.cor = d.cor ? d.cor.trim() : null;
    if (d.chassi !== undefined) updatedFields.chassi = d.chassi ? d.chassi.trim() : null;
    if (d.renavam !== undefined) updatedFields.renavam = d.renavam ? d.renavam.trim() : null;
    if (d.quilometragemAtual !== undefined && d.quilometragemAtual !== null) updatedFields.quilometragemAtual = p(d.quilometragemAtual, 'int');
    
    if (d.oleoKm !== undefined) updatedFields['manutencaoInfo.proxTrocaOleoKm'] = p(d.oleoKm, 'int');
    if (d.oleoData !== undefined) updatedFields['manutencaoInfo.proxTrocaOleoData'] = p(d.oleoData, 'date');
    if (d.frequenciaChecklist !== undefined) {
        const freq = p(d.frequenciaChecklist, 'int');
        updatedFields['manutencaoInfo.frequenciaChecklistDias'] = freq;
        if (freq && freq > 0) {
            const baseDate = veiculoAtual.manutencaoInfo.ultimoChecklistData || new Date();
            updatedFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(baseDate).setDate(new Date(baseDate).getDate() + freq));
        } else {
            updatedFields['manutencaoInfo.dataProxChecklist'] = null;
        }
    }
    try {
        if (updatedFields.placa && updatedFields.placa !== veiculoAtual.placa) {
            if (await db.collection('veiculos').findOne({ placa: updatedFields.placa, _id: { $ne: new ObjectId(id) } }))
                return res.status(409).json({ message: `Placa ${updatedFields.placa} já em uso.` });
        }
        const result = await db.collection('veiculos').updateOne({ _id: new ObjectId(id) }, { $set: updatedFields });
        if (result.matchedCount === 0) return res.status(404).json({ message: "Veículo não atualizado." });
        res.status(200).json({ message: "Veículo atualizado." });
    } catch (error) { res.status(500).json({ message: 'Erro ao atualizar veículo.' }); }
});
app.get('/api/manutencoes/proximas', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });
app.get('/api/manutencoes/historico', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });
app.post('/api/manutencoes', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });
app.delete('/api/manutencoes/:id', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });
app.get('/api/checklists/historico', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });
app.post('/api/checklists', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });
app.delete('/api/checklists/:id', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });
app.post('/api/abastecimentos', simpleAuthCheck, async (req, res) => { /* ...código já fornecido... */ });


// --- ROTAS DA API PARA RELATÓRIOS ---

// 1. Gastos Detalhados (Manutenções e Abastecimentos)
app.get('/api/relatorios/gastos-detalhados', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;

    try {
        let queryManutencoes = {};
        let queryAbastecimentos = {};

        if (veiculoId && veiculoId !== 'todos') {
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID de veículo inválido." });
            queryManutencoes.veiculoId = new ObjectId(veiculoId);
            queryAbastecimentos.veiculoId = new ObjectId(veiculoId);
        }

        const dateFilterManutencao = getDateQuery(mes, ano);
        if (dateFilterManutencao.dateMatch) {
            queryManutencoes.dataRealizacao = dateFilterManutencao.dateMatch;
        }
        const dateFilterAbastecimento = getDateQuery(mes, ano);
        if (dateFilterAbastecimento.dateMatch) {
            queryAbastecimentos.data = dateFilterAbastecimento.dateMatch;
        }

        const manutencoes = await db.collection('manutencoes').find(queryManutencoes).toArray();
        const abastecimentos = await db.collection('abastecimentos').find(queryAbastecimentos).toArray();

        let gastosCombinados = [];
        let totalGeral = 0;

        manutencoes.forEach(m => {
            if (m.custo && m.custo > 0) {
                gastosCombinados.push({
                    _id: m._id,
                    data: m.dataRealizacao,
                    veiculoId: m.veiculoId,
                    veiculoPlaca: m.veiculoPlaca,
                    tipoGasto: "Manutenção",
                    descricaoGasto: m.tipoManutencao || m.descricao || "Manutenção geral",
                    valorGasto: m.custo
                });
                totalGeral += m.custo;
            }
        });

        abastecimentos.forEach(a => {
            if (a.custoTotal && a.custoTotal > 0) {
                gastosCombinados.push({
                    _id: a._id,
                    data: a.data,
                    veiculoId: a.veiculoId,
                    veiculoPlaca: a.veiculoPlaca,
                    tipoGasto: "Combustível",
                    descricaoGasto: `Abastecimento ${a.litros.toFixed(2)}L (${a.posto || 'N/I'})`,
                    valorGasto: a.custoTotal
                });
                totalGeral += a.custoTotal;
            }
        });

        gastosCombinados.sort((x, y) => new Date(y.data) - new Date(x.data)); // Mais recentes primeiro

        res.status(200).json({
            detalhes: gastosCombinados,
            sumario: {
                totalGastos: totalGeral
            }
        });

    } catch (error) {
        console.error("Erro ao buscar gastos detalhados:", error);
        res.status(500).json({ message: "Erro interno ao buscar gastos detalhados." });
    }
});


// 2. Dados para Gráficos de Gastos Mensais
app.get('/api/relatorios/gastos-mensais', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, ano } = req.query;

    const targetAno = (ano && ano !== 'todos') ? parseInt(ano) : new Date().getFullYear();

    try {
        let matchStage = { $match: {} };
        if (veiculoId && veiculoId !== 'todos') {
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID de veículo inválido." });
            matchStage.$match.veiculoId = new ObjectId(veiculoId);
        }
        
        // Match para o ano inteiro
        matchStage.$match.data = { // Campo de data para abastecimentos
            $gte: new Date(targetAno, 0, 1),
            $lt: new Date(targetAno + 1, 0, 1)
        };
        
        const groupStageAbastecimentos = {
            $group: {
                _id: { mes: { $month: "$data" } }, // Agrupa por mês
                totalCombustivel: { $sum: "$custoTotal" }
            }
        };
        
        let matchStageManutencoes = { ...matchStage.$match }; // Copia o match base
        matchStageManutencoes.dataRealizacao = matchStageManutencoes.data; // Ajusta nome do campo de data
        delete matchStageManutencoes.data; // Remove o campo 'data' que não existe em manutenções
        matchStageManutencoes.custo = { $gt: 0 }; // Considera apenas manutenções com custo

        const groupStageManutencoes = {
            $group: {
                _id: { mes: { $month: "$dataRealizacao" } },
                totalManutencao: { $sum: "$custo" }
            }
        };
        
        const sortStage = { $sort: { "_id.mes": 1 } }; // Ordena por mês

        const gastosCombustivel = await db.collection('abastecimentos').aggregate([matchStage, groupStageAbastecimentos, sortStage]).toArray();
        const gastosManutencao = await db.collection('manutencoes').aggregate([matchStageManutencoes, groupStageManutencoes, sortStage]).toArray();
        
        const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        let labels = mesesNomes; // Todos os 12 meses
        let dataCombustivel = Array(12).fill(0);
        let dataManutencao = Array(12).fill(0);

        gastosCombustivel.forEach(item => {
            dataCombustivel[item._id.mes - 1] = item.totalCombustivel;
        });
        gastosManutencao.forEach(item => {
            dataManutencao[item._id.mes - 1] = item.totalManutencao;
        });
        
        let datasets = [
            { label: 'Gastos com Combustível', data: dataCombustivel, backgroundColor: 'rgba(255, 99, 132, 0.5)' },
            { label: 'Gastos com Manutenção', data: dataManutencao, backgroundColor: 'rgba(54, 162, 235, 0.5)' }
        ];

        res.status(200).json({ labels, datasets });

    } catch (error) {
        console.error("Erro ao buscar dados para gráfico de gastos mensais:", error);
        res.status(500).json({ message: "Erro interno ao buscar dados para gráfico." });
    }
});

// 3. Análise de Combustível
app.get('/api/relatorios/analise-combustivel', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;

    try {
        let queryAbastecimentos = {};
        if (veiculoId && veiculoId !== 'todos') {
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID de veículo inválido." });
            queryAbastecimentos.veiculoId = new ObjectId(veiculoId);
        }
        const dateFilter = getDateQuery(mes, ano);
        if (dateFilter.dateMatch) {
            queryAbastecimentos.data = dateFilter.dateMatch;
        }

        // Busca todos os abastecimentos, ordenados por veículo, data e KM para cálculo de consumo
        const abastecimentos = await db.collection('abastecimentos')
            .find(queryAbastecimentos)
            .sort({ veiculoId: 1, data: 1, quilometragemAtual: 1 })
            .toArray();
        
        let detalhesFormatados = [];
        let sumario = {
            totalGastoCombustivel: 0,
            totalLitros: 0,
            totalKmRodados: 0,
            veiculosAnalisados: {} // Para cálculos por veículo
        };

        let ultimoKmPorVeiculo = {};

        for (const a of abastecimentos) {
            sumario.totalGastoCombustivel += a.custoTotal;
            sumario.totalLitros += a.litros;

            const vIdStr = a.veiculoId.toString();
            if (!sumario.veiculosAnalisados[vIdStr]) {
                sumario.veiculosAnalisados[vIdStr] = {
                    placa: a.veiculoPlaca,
                    totalKmRodadosVeiculo: 0,
                    totalLitrosVeiculo: 0,
                    abastecimentos: 0
                };
            }
            sumario.veiculosAnalisados[vIdStr].totalLitrosVeiculo += a.litros;
            sumario.veiculosAnalisados[vIdStr].abastecimentos++;


            let kmRodados = null;
            let consumoNoTrecho = null;

            if (ultimoKmPorVeiculo[vIdStr] && a.quilometragemAtual > ultimoKmPorVeiculo[vIdStr]) {
                kmRodados = a.quilometragemAtual - ultimoKmPorVeiculo[vIdStr];
                sumario.totalKmRodados += kmRodados;
                sumario.veiculosAnalisados[vIdStr].totalKmRodadosVeiculo += kmRodados;
                if (a.litros > 0) { // Considera apenas o abastecimento atual para o consumo do trecho
                    consumoNoTrecho = kmRodados / a.litros;
                }
            }
            
            detalhesFormatados.push({
                ...a,
                kmRodados: kmRodados,
                consumoNoTrecho: consumoNoTrecho
            });
            ultimoKmPorVeiculo[vIdStr] = a.quilometragemAtual;
        }
        
        sumario.consumoMedioGeral = sumario.totalLitros > 0 ? sumario.totalKmRodados / sumario.totalLitros : 0;
        sumario.custoMedioPorKm = sumario.totalKmRodados > 0 ? sumario.totalGastoCombustivel / sumario.totalKmRodados : 0;
        sumario.precoMedioLitro = sumario.totalLitros > 0 ? sumario.totalGastoCombustivel / sumario.totalLitros : 0;

        res.status(200).json({
            detalhes: detalhesFormatados.sort((x,y) => new Date(y.data) - new Date(x.data)), // Mais recentes primeiro para exibição
            sumario
        });

    } catch (error) {
        console.error("Erro ao buscar análise de combustível:", error);
        res.status(500).json({ message: "Erro interno ao buscar análise de combustível." });
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
