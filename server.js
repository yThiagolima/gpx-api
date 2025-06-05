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

// --- Helper para criar query de data para Relatórios ---
function getDateQuery(mes, ano) {
    const query = {};
    if (ano && ano !== 'todos') {
        const year = parseInt(ano);
        let startDate, endDate;
        if (mes && mes !== 'todos') {
            const month = parseInt(mes) - 1; 
            startDate = new Date(Date.UTC(year, month, 1, 0, 0, 0)); 
            endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)); 
        } else {
            startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0)); 
            endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)); 
        }
        query.dateMatch = { $gte: startDate, $lte: endDate }; 
    }
    return query;
}


// --- Rotas ---
app.get('/', (req, res) => {
    res.send('🎉 Backend GPX7 v2 está funcionando e conectado ao MongoDB! 🎉');
});

// --- Rota de REGISTRO ---
app.post('/register', async (req, res) => { /* ...código mantido... */ });

// --- Rota de LOGIN ---
// --- Rota de LOGIN ---
app.post('/login', simpleAuthCheck, async (req, res) => { // Adicionei simpleAuthCheck se for padrão, mas login geralmente não tem auth prévio. Remova se não aplicável.
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

        // Procura pelo usuário pelo nome de usuário (case-insensitive) ou email (case-sensitive, pois foi salvo em minúsculo)
        const user = await usersCollection.findOne({ 
            $or: [
                { username: { $regex: new RegExp(`^${loginIdentifierLower}$`, 'i') } }, 
                { email: loginIdentifierLower }
            ] 
        });

        if (!user) {
            console.log('Falha no login: Usuário/Email não encontrado para ->', loginIdentifier);
            return res.status(401).json({ message: 'Credenciais inválidas.' }); // Mensagem genérica por segurança
        }

        const isPasswordMatch = await bcrypt.compare(password, user.password);

        if (!isPasswordMatch) {
            console.log('Falha no login: Senha incorreta para ->', user.username);
            return res.status(401).json({ message: 'Credenciais inválidas.' }); // Mensagem genérica
        }

        // Login bem-sucedido
        console.log('Login bem-sucedido para:', user.username);
        // Aqui você geraria e retornaria um token JWT em uma aplicação mais robusta
        res.status(200).json({
            message: 'Login bem-sucedido!',
            user: { // Retorna apenas dados seguros do usuário
                id: user._id,
                username: user.username, // Retorna o username com o case original salvo
                email: user.email
            }
            // token: tokenGerado // Exemplo de como seria com JWT
        });

    } catch (error) {
        console.error('Erro durante o login:', error);
        res.status(500).json({ message: 'Erro interno ao tentar fazer login.' });
    }
});
const simpleAuthCheck = (req, res, next) => { next(); };

// --- ROTAS DA API PARA A DASHBOARD ---
app.get('/api/dashboard/stats', simpleAuthCheck, async (req, res) => { /* ...código mantido... */ });
app.get('/api/dashboard/recent-activity', simpleAuthCheck, async (req, res) => { /* ...código mantido... */ });

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
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(Date.parse(v)) : v)) : null; // Ajuste para parse de data
    const novoVeiculo = {
        placa: (d.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), marca: (d.marca||'').trim(), modelo: (d.modelo||'').trim(),
        anoFabricacao: p(d.anoFabricacao, 'int'), anoModelo: p(d.anoModelo, 'int'), cor: d.cor ? d.cor.trim() : null,
        chassi: d.chassi ? d.chassi.trim() : null, renavam: d.renavam ? d.renavam.trim() : null,
        quilometragemAtual: p(d.quilometragemAtual, 'int'),
        manutencaoInfo: {
            proxTrocaOleoKm: p(d.oleoKm, 'int'), proxTrocaOleoData: p(d.oleoData, 'date'),
            frequenciaChecklistDias: p(d.frequenciaChecklist, 'int'),
            dataProxChecklist: (d.frequenciaChecklist && parseInt(d.frequenciaChecklist,10) > 0) ? new Date(new Date().setDate(new Date().getDate() + parseInt(d.frequenciaChecklist,10))) : null,
            ultimaTrocaOleoKm: null, ultimaTrocaOleoData: null, ultimoChecklistData: null
        }, dataCadastro: new Date()
    };
    if (!novoVeiculo.placa || !novoVeiculo.marca || !novoVeiculo.modelo || novoVeiculo.anoFabricacao === null || novoVeiculo.anoModelo === null || novoVeiculo.quilometragemAtual === null)
        return res.status(400).json({ message: "Campos obrigatórios não preenchidos." });
    try {
        if (await db.collection('veiculos').findOne({ placa: novoVeiculo.placa }))
            return res.status(409).json({ message: `Placa ${novoVeiculo.placa} já cadastrada.` });
        const result = await db.collection('veiculos').insertOne(novoVeiculo);
        res.status(201).json({ message: 'Veículo cadastrado!', veiculo: { _id: result.insertedId, ...novoVeiculo } });
    } catch (error) { res.status(500).json({ message: 'Erro ao cadastrar veículo.' }); }
});
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
    const p = (v, t) => (v !== undefined && v !== null && v !== '') ? (t === 'int' ? parseInt(v,10) : (t === 'date' ? new Date(Date.parse(v)) : v)) : undefined; // Ajuste para parse de data e retornar undefined
    const veiculoAtual = await db.collection('veiculos').findOne({ _id: new ObjectId(id) });
    if (!veiculoAtual) return res.status(404).json({ message: "Veículo não encontrado." });
    
    const $set = { dataAtualizacao: new Date() }; // Inicia com o campo de atualização
    if (d.placa !== undefined) $set.placa = d.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (d.marca !== undefined) $set.marca = d.marca.trim();
    if (d.modelo !== undefined) $set.modelo = d.modelo.trim();
    if (d.anoFabricacao !== undefined) $set.anoFabricacao = p(d.anoFabricacao, 'int');
    if (d.anoModelo !== undefined) $set.anoModelo = p(d.anoModelo, 'int');
    if (d.cor !== undefined) $set.cor = d.cor ? d.cor.trim() : null;
    if (d.chassi !== undefined) $set.chassi = d.chassi ? d.chassi.trim() : null;
    if (d.renavam !== undefined) $set.renavam = d.renavam ? d.renavam.trim() : null;
    if (d.quilometragemAtual !== undefined) $set.quilometragemAtual = p(d.quilometragemAtual, 'int');
    
    if (d.oleoKm !== undefined) $set['manutencaoInfo.proxTrocaOleoKm'] = p(d.oleoKm, 'int'); 
    else if (d.oleoKm === null) $set['manutencaoInfo.proxTrocaOleoKm'] = null;

    if (d.oleoData !== undefined) $set['manutencaoInfo.proxTrocaOleoData'] = p(d.oleoData, 'date'); 
    else if (d.oleoData === null) $set['manutencaoInfo.proxTrocaOleoData'] = null;

    if (d.frequenciaChecklist !== undefined) {
        const freq = p(d.frequenciaChecklist, 'int');
        $set['manutencaoInfo.frequenciaChecklistDias'] = freq;
        if (freq && freq > 0) {
            const baseDate = (veiculoAtual.manutencaoInfo && veiculoAtual.manutencaoInfo.ultimoChecklistData) ? new Date(veiculoAtual.manutencaoInfo.ultimoChecklistData) : new Date();
            $set['manutencaoInfo.dataProxChecklist'] = new Date(baseDate.setDate(baseDate.getDate() + freq));
        } else { 
            $set['manutencaoInfo.dataProxChecklist'] = null; 
        }
    } else if (d.frequenciaChecklist === null) { 
         $set['manutencaoInfo.frequenciaChecklistDias'] = null; 
         $set['manutencaoInfo.dataProxChecklist'] = null; 
    }
    
    if (($set.placa !== undefined && !$set.placa) /* ...outras validações ... */ ) return res.status(400).json({ message: "Campos obrigatórios não podem ser vazios." });
    try {
        if ($set.placa && $set.placa !== veiculoAtual.placa) {
            if (await db.collection('veiculos').findOne({ placa: $set.placa, _id: { $ne: new ObjectId(id) } })) return res.status(409).json({ message: `Placa ${$set.placa} já em uso.` });
        }
        const result = await db.collection('veiculos').updateOne({ _id: new ObjectId(id) }, { $set });
        if (result.matchedCount === 0) return res.status(404).json({ message: "Veículo não atualizado." });
        res.status(200).json({ message: "Veículo atualizado." });
    } catch (error) { res.status(500).json({ message: 'Erro ao atualizar veículo.' }); }
});

// --- ROTAS DA API PARA MANUTENÇÕES ---
// --- ROTAS DA API PARA MANUTENÇÕES ---

app.get('/api/manutencoes/proximas', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const veiculos = await db.collection('veiculos').find({}).toArray();
        const inicioHoje = new Date(new Date().setUTCHours(0, 0, 0, 0)); 
        const tresDiasDepois = new Date(new Date(inicioHoje).setUTCDate(inicioHoje.getUTCDate() + 3));
        let eventosFuturosEAlertas = [];

        veiculos.forEach(v => {
            if (v.manutencaoInfo) {
                // 1. Próxima Troca de Óleo
                let statusOleo = "OK"; 
                let vencidoKmOleo = false; 
                let vencidoDataOleo = false;
                let dataOleoConsiderada = v.manutencaoInfo.proxTrocaOleoData ? new Date(v.manutencaoInfo.proxTrocaOleoData) : null;

                if (v.manutencaoInfo.proxTrocaOleoKm && v.quilometragemAtual >= v.manutencaoInfo.proxTrocaOleoKm) {
                    vencidoKmOleo = true;
                }
                if (dataOleoConsiderada && dataOleoConsiderada < inicioHoje) {
                    vencidoDataOleo = true;
                }

                if (vencidoKmOleo && vencidoDataOleo) statusOleo = "VENCIDO_DATA_KM";
                else if (vencidoKmOleo) statusOleo = "VENCIDO_KM";
                else if (vencidoDataOleo) statusOleo = "VENCIDO_DATA";
                
                if (v.manutencaoInfo.proxTrocaOleoKm || dataOleoConsiderada ) {
                     if (statusOleo !== "OK" || (dataOleoConsiderada && dataOleoConsiderada >= inicioHoje ) ) { // Mostra se vencido OU se a data é futura/hoje
                        eventosFuturosEAlertas.push({
                            _id: v._id.toString() + '_oleo', // ID único para o frontend
                            veiculoId: v._id.toString(),
                            veiculoPlaca: v.placa,
                            tipoEvento: 'OLEO', // Tipo para o frontend diferenciar
                            descricao: `Próxima troca de óleo.`,
                            detalhes: `Data Prev.: ${dataOleoConsiderada ? dataOleoConsiderada.toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}. KM Prev.: ${v.manutencaoInfo.proxTrocaOleoKm ? v.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR') : 'N/A'}. KM Atual: ${v.quilometragemAtual.toLocaleString('pt-BR')}.`,
                            dataPrevista: v.manutencaoInfo.proxTrocaOleoData, 
                            kmPrevisto: v.manutencaoInfo.proxTrocaOleoKm,
                            kmAtual: v.quilometragemAtual,
                            statusAlerta: statusOleo 
                        });
                    }
                }

                // 2. Próximo Checklist Agendado
                let statusChecklist = "OK";
                let dataCheckConsiderada = v.manutencaoInfo.dataProxChecklist ? new Date(v.manutencaoInfo.dataProxChecklist) : null;
                if (dataCheckConsiderada) {
                    if (dataCheckConsiderada < inicioHoje) { // Já passou de ontem
                        statusChecklist = "VENCIDO_DATA";
                    } else if (dataCheckConsiderada >= inicioHoje && dataCheckConsiderada <= tresDiasDepois) { // De hoje até 3 dias pra frente
                        statusChecklist = "AVISO_CHECKLIST"; // Amarelo
                    }
                    // Adiciona apenas se estiver vencido ou for um agendamento futuro (incluindo aviso)
                     if (statusChecklist !== "OK" || dataCheckConsiderada >= inicioHoje) {
                        eventosFuturosEAlertas.push({
                            _id: v._id.toString() + '_checklist',  // ID único para o frontend
                            veiculoId: v._id.toString(),
                            veiculoPlaca: v.placa,
                            tipoEvento: 'CHECKLIST', // Tipo para o frontend diferenciar
                            descricao: `Próximo checklist periódico. Frequência: ${v.manutencaoInfo.frequenciaChecklistDias || 'N/A'} dias.`,
                            detalhes: `Data Prevista: ${dataCheckConsiderada.toLocaleDateString('pt-BR', {timeZone: 'UTC'})}`,
                            dataPrevista: v.manutencaoInfo.dataProxChecklist,
                            statusAlerta: statusChecklist
                        });
                    }
                }
            }
        });
        // Ordena para que vencidos apareçam primeiro, depois por data mais próxima
        eventosFuturosEAlertas.sort((a, b) => {
            const prioridadeStatus = (status) => {
                if (status && status.startsWith("VENCIDO")) return 0; // Vencidos primeiro
                if (status === "AVISO_CHECKLIST") return 1; // Avisos depois
                return 2; // OK ou futuro por último
            };
            if (prioridadeStatus(a.statusAlerta) !== prioridadeStatus(b.statusAlerta)) {
                return prioridadeStatus(a.statusAlerta) - prioridadeStatus(b.statusAlerta);
            }
            // Se mesma prioridade, ordena por data (mais antiga primeiro)
            const dateA = a.dataPrevista ? new Date(a.dataPrevista) : new Date(8640000000000000); // Joga sem data para o fim
            const dateB = b.dataPrevista ? new Date(b.dataPrevista) : new Date(8640000000000000);
            return dateA.getTime() - dateB.getTime();
        });
        res.status(200).json(eventosFuturosEAlertas);
    } catch (error) {
        console.error('Erro ao buscar próximas manutenções e checklists:', error);
        res.status(500).json({ message: 'Erro ao buscar próximas manutenções e checklists.' });
    }
});

app.get('/api/manutencoes/historico', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query; 
    try {
        let query = {};
        if (veiculoId && veiculoId !== 'todos') { 
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID Veículo inválido." }); 
            query.veiculoId = new ObjectId(veiculoId); 
        }
        const dateFilter = getDateQuery(mes, ano); 
        if (dateFilter.dateMatch) {
            query.dataRealizacao = dateFilter.dateMatch;
        }
        const historico = await db.collection('manutencoes').find(query).sort({ dataRealizacao: -1, dataRegistro: -1 }).toArray();
        res.status(200).json(historico);
    } catch (error) { 
        console.error('Erro ao buscar histórico de manutenções:', error); 
        res.status(500).json({ message: 'Erro ao buscar histórico de manutenções.' }); 
    }
});

app.post('/api/manutencoes', simpleAuthCheck, async (req, res) => { 
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { 
        veiculoId, tipoManutencao, dataRealizacao, custo, descricao, quilometragem, realizadaPor,
        proxTrocaOleoKm, proxTrocaOleoData 
    } = req.body;

    if (!veiculoId || !tipoManutencao || !dataRealizacao || quilometragem === undefined) {
        return res.status(400).json({ message: 'Campos obrigatórios: Veículo, Tipo, Data e Quilometragem.' });
    }
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });

        const novaManutencao = {
            veiculoId: new ObjectId(veiculoId), 
            veiculoPlaca: veiculo.placa, 
            tipoManutencao: tipoManutencao.trim(), 
            dataRealizacao: new Date(Date.parse(dataRealizacao)), 
            custo: custo ? parseFloat(custo) : null, 
            descricao: descricao ? descricao.trim() : null,
            quilometragem: quilometragem ? parseInt(quilometragem, 10) : null,
            realizadaPor: realizadaPor ? realizadaPor.trim() : null, 
            dataRegistro: new Date()
        };
        const result = await db.collection('manutencoes').insertOne(novaManutencao);

        let updateVeiculoFields = {};
        const kmManutencao = novaManutencao.quilometragem;

        if (kmManutencao && kmManutencao > (veiculo.quilometragemAtual || 0) ) {
             updateVeiculoFields.quilometragemAtual = kmManutencao;
        }

        if ((tipoManutencao.toLowerCase().includes('óleo') || tipoManutencao.toLowerCase().includes('oleo')) ) {
            updateVeiculoFields['manutencaoInfo.ultimaTrocaOleoData'] = novaManutencao.dataRealizacao;
            if (kmManutencao) {
                updateVeiculoFields['manutencaoInfo.ultimaTrocaOleoKm'] = kmManutencao;
            }
            if (proxTrocaOleoKm !== undefined && proxTrocaOleoKm !== null && proxTrocaOleoKm !== '') {
                updateVeiculoFields['manutencaoInfo.proxTrocaOleoKm'] = parseInt(proxTrocaOleoKm, 10);
            } else if (proxTrocaOleoKm === '' || proxTrocaOleoKm === null) {
                 updateVeiculoFields['manutencaoInfo.proxTrocaOleoKm'] = null;
            }
            if (proxTrocaOleoData !== undefined && proxTrocaOleoData !== null && proxTrocaOleoData !== '') {
                updateVeiculoFields['manutencaoInfo.proxTrocaOleoData'] = new Date(Date.parse(proxTrocaOleoData));
            } else if (proxTrocaOleoData === '' || proxTrocaOleoData === null) {
                 updateVeiculoFields['manutencaoInfo.proxTrocaOleoData'] = null;
            }
        }
        
        if (Object.keys(updateVeiculoFields).length > 0) {
            await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });
        }

        res.status(201).json({ message: 'Manutenção registrada com sucesso!', manutencao: { _id: result.insertedId, ...novaManutencao } });
    } catch (error) { 
        console.error('Erro ao registrar manutenção:', error); 
        res.status(500).json({ message: 'Erro interno ao tentar registrar manutenção.' }); 
    }
});

app.delete('/api/manutencoes/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params; 
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID de manutenção inválido." });
    try {
        const result = await db.collection('manutencoes').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Manutenção não encontrada para exclusão." });
        }
        // Considerar se a exclusão de uma manutenção (ex: troca de óleo) deveria reverter
        // 'ultimaTrocaOleoData'/'Km' no veículo. Por ora, é uma exclusão simples do registro.
        res.status(200).json({ message: "Manutenção excluída com sucesso.", id: id });
    } catch (error) { 
        console.error('Erro ao excluir manutenção:', error); 
        res.status(500).json({ message: 'Erro interno ao tentar excluir manutenção.' }); 
    }
});

// --- ROTAS DA API PARA CHECKLISTS ---
app.post('/api/checklists/iniciar', simpleAuthCheck, async (req, res) => { // ROTA ATUALIZADA
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId } = req.body;
    if (!veiculoId || !ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID do veículo inválido." });

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });

        const dataDeInicio = new Date(); // Usar a data atual para o início

        const novoChecklistPendente = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculo.placa,
            dataIniciado: dataDeInicio,
            status: "pendente", 
            itensVerificados: [], 
            dataRealizacao: null,
            quilometragem: null,
            realizadoPor: null,
            observacoesGerais: null
        };
        const result = await db.collection('checklists').insertOne(novoChecklistPendente);

        // ATUALIZAÇÃO: Após iniciar um checklist, considerar a data de início como a "última realização"
        // para que o agendamento original suma da lista de "próximos" até que este seja concluído.
        let updateVeiculoFields = {
            'manutencaoInfo.ultimoChecklistData': dataDeInicio // Data em que o checklist foi efetivamente "pego" para fazer
        };
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freqDias = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freqDias > 0) {
                updateVeiculoFields['manutencaoInfo.dataProxChecklist'] = new Date(new Date(dataDeInicio).setDate(dataDeInicio.getDate() + freqDias));
            }
        }
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: updateVeiculoFields });

        res.status(201).json({ 
            message: 'Checklist iniciado e marcado como pendente! O agendamento original foi atualizado.', 
            checklist: { _id: result.insertedId, ...novoChecklistPendente }
        });
    } catch (error) {
        console.error("Erro ao iniciar checklist:", error);
        res.status(500).json({ message: "Erro ao iniciar checklist." });
    }
});
app.get('/api/checklists/pendentes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const pendentes = await db.collection('checklists').find({ status: "pendente" }).sort({ dataIniciado: -1 }).toArray();
        res.status(200).json(pendentes);
    } catch (error) { console.error("Erro buscar pendentes:", error); res.status(500).json({ message: "Erro buscar pendentes." }); }
});
app.post('/api/checklists/:id/registrar-resultado', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params; const { dataRealizacao, quilometragem, realizadoPor, observacoesGerais, itensVerificados } = req.body;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID checklist inválido." });
    if (!dataRealizacao || quilometragem === undefined || !realizadoPor || !Array.isArray(itensVerificados)) return res.status(400).json({ message: "Dados incompletos." });
    try {
        const checklist = await db.collection('checklists').findOne({ _id: new ObjectId(id), status: "pendente" });
        if (!checklist) return res.status(404).json({ message: "Checklist pendente não encontrado." });
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(checklist.veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo do checklist não encontrado." });
        const pKm = parseInt(quilometragem, 10);
        const update = { $set: { status: "concluido", dataRealizacao: new Date(Date.parse(dataRealizacao)), quilometragem: pKm, realizadoPor: realizadoPor.trim(), observacoesGerais: observacoesGerais ? observacoesGerais.trim() : null, itensVerificados } };
        await db.collection('checklists').updateOne({ _id: new ObjectId(id) }, update);
        let updateVeiculo = { 'manutencaoInfo.ultimoChecklistData': new Date(Date.parse(dataRealizacao)) };
        if (pKm > (veiculo.quilometragemAtual || 0)) updateVeiculo.quilometragemAtual = pKm;
        if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.frequenciaChecklistDias) {
            const freq = parseInt(veiculo.manutencaoInfo.frequenciaChecklistDias, 10);
            if (freq > 0) updateVeiculo['manutencaoInfo.dataProxChecklist'] = new Date(new Date(Date.parse(dataRealizacao)).setDate(new Date(Date.parse(dataRealizacao)).getDate() + freq));
        }
        await db.collection('veiculos').updateOne({ _id: new ObjectId(checklist.veiculoId) }, { $set: updateVeiculo });
        res.status(200).json({ message: "Resultados registrados!" });
    } catch (error) { console.error("Erro registrar resultados checklist:", error); res.status(500).json({ message: "Erro registrar resultados." }); }
});
app.get('/api/checklists/historico', simpleAuthCheck, async (req, res) => { 
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query; 
    try {
        let query = { status: "concluido" }; 
        if (veiculoId && veiculoId !== 'todos') { if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID Veículo inválido." }); query.veiculoId = new ObjectId(veiculoId); }
        const dateFilter = getDateQuery(mes, ano); if (dateFilter.dateMatch) query.dataRealizacao = dateFilter.dateMatch;
        const historico = await db.collection('checklists').find(query).sort({ dataRealizacao: -1 }).toArray();
        const formatado = historico.map(c => ({ _id: c._id, veiculoId: c.veiculoId, veiculoPlaca: c.veiculoPlaca, dataRealizacao: c.dataRealizacao, quilometragem: c.quilometragem, realizadoPor: c.realizadoPor, observacoes: c.observacoesGerais || (c.itensVerificados && c.itensVerificados.some(i => i.statusItem !== 'OK') ? 'Itens com atenção' : 'Tudo OK') }));
        res.status(200).json(formatado);
    } catch (error) { console.error('Erro histórico checklists:', error); res.status(500).json({ message: 'Erro histórico checklists.' }); }
});
app.delete('/api/checklists/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params; if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID inválido." });
    try {
        const result = await db.collection('checklists').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) return res.status(404).json({ message: "Checklist não encontrado." });
        res.status(200).json({ message: "Checklist excluído." });
    } catch (error) { console.error('Erro excluir checklist:', error); res.status(500).json({ message: 'Erro excluir checklist.' }); }
});

// --- ROTAS DA API PARA REQUISIÇÕES ---
app.post('/api/requisicoes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { requisicaoId: requisicaoIdUsuario, entreguePara } = req.body; // Renomeado para clareza no backend

    if (!requisicaoIdUsuario || !entreguePara) {
        return res.status(400).json({ message: "ID da Requisição e 'Entregue Para' são obrigatórios." });
    }

    try {
        const requisicoesCollection = db.collection('requisicoes');
        // Verifica se o ID da requisição fornecido pelo usuário já existe
        const existingRequisicao = await requisicoesCollection.findOne({ idRequisicaoUsuario: requisicaoIdUsuario.trim() });
        if (existingRequisicao) {
            return res.status(409).json({ message: `O ID de Requisição '${requisicaoIdUsuario}' já existe.` });
        }

        const novaRequisicao = {
            idRequisicaoUsuario: requisicaoIdUsuario.trim(),
            entreguePara: entreguePara.trim(),
            dataCriacao: new Date(),
            status: "disponivel", // Status inicial
            abastecimentoIdAssociado: null,
            dataUtilizacao: null
        };
        const result = await requisicoesCollection.insertOne(novaRequisicao);
        res.status(201).json({ 
            message: "Requisição cadastrada com sucesso!", 
            requisicao: { _id: result.insertedId, ...novaRequisicao }
        });
    } catch (error) {
        console.error("Erro ao cadastrar requisição:", error);
        res.status(500).json({ message: "Erro interno ao cadastrar requisição." });
    }
});

app.get('/api/requisicoes', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { status, search } = req.query;
    
    try {
        let query = {};
        if (status && status !== 'todas') {
            query.status = status; // 'disponivel' ou 'utilizada'
        }
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { idRequisicaoUsuario: searchRegex },
                { entreguePara: searchRegex }
            ];
        }
        const requisicoes = await db.collection('requisicoes').find(query).sort({ dataCriacao: -1 }).toArray();
        res.status(200).json(requisicoes);
    } catch (error) {
        console.error("Erro ao listar requisições:", error);
        res.status(500).json({ message: "Erro interno ao listar requisições." });
    }
});

app.get('/api/requisicoes/disponiveis', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    try {
        const disponiveis = await db.collection('requisicoes')
            .find({ status: "disponivel" })
            .sort({ dataCriacao: 1 }) // Mais antigas primeiro, talvez? Ou por ID.
            .project({ idRequisicaoUsuario: 1, entreguePara: 1 }) // Retorna apenas o ID do usuário e para quem foi entregue
            .toArray();
        res.status(200).json(disponiveis);
    } catch (error) {
        console.error("Erro ao listar requisições disponíveis:", error);
        res.status(500).json({ message: "Erro interno ao listar requisições disponíveis." });
    }
});
app.delete('/api/requisicoes/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID de requisição inválido." });

    try {
        const requisicao = await db.collection('requisicoes').findOne({ _id: new ObjectId(id) });
        if (!requisicao) {
            return res.status(404).json({ message: "Requisição não encontrada." });
        }
        // Regra de negócio: não permitir excluir se já estiver utilizada?
        if (requisicao.status === 'utilizada') {
            return res.status(400).json({ message: "Não é possível excluir uma requisição que já foi utilizada." });
        }

        const result = await db.collection('requisicoes').deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Requisição não encontrada para exclusão." });
        }
        res.status(200).json({ message: "Requisição excluída com sucesso." });
    } catch (error) {
        console.error("Erro ao excluir requisição:", error);
        res.status(500).json({ message: "Erro interno ao excluir requisição." });
    }
});

// --- ROTAS DA API PARA ABASTECIMENTOS ---
app.post('/api/abastecimentos', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, data, quilometragemAtual, litros, valorPorLitro, custoTotal, posto, observacoes } = req.body;
    if (!veiculoId || !data || !quilometragemAtual || !litros || !valorPorLitro) return res.status(400).json({ message: "Campos obrigatórios." });
    if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID veículo inválido." });
    const pKm = parseInt(quilometragemAtual, 10), pL = parseFloat(litros), pVl = parseFloat(valorPorLitro);
    let pCt = custoTotal ? parseFloat(custoTotal) : (pL * pVl);
    if (isNaN(pKm) || pKm < 0 || isNaN(pL) || pL <= 0 || isNaN(pVl) || pVl <= 0 || isNaN(pCt) || pCt < 0) return res.status(400).json({ message: "Valores numéricos inválidos." });
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) return res.status(404).json({ message: "Veículo não encontrado." });
        if (pKm < (veiculo.quilometragemAtual || 0)) return res.status(400).json({ message: `KM informada (${pKm.toLocaleString('pt-BR')}km) menor que a última registrada (${(veiculo.quilometragemAtual || 0).toLocaleString('pt-BR')}km).` });
        const novoAbastecimento = { veiculoId: new ObjectId(veiculoId), veiculoPlaca: veiculo.placa, data: new Date(Date.parse(data)), quilometragemAtual: pKm, litros: pL, valorPorLitro: pVl, custoTotal: pCt, posto: posto ? posto.trim() : null, observacoes: observacoes ? observacoes.trim() : null, dataRegistro: new Date() };
        const result = await db.collection('abastecimentos').insertOne(novoAbastecimento);
        await db.collection('veiculos').updateOne({ _id: new ObjectId(veiculoId) }, { $set: { quilometragemAtual: pKm } });
        let alertaOleoMsg = null; if (veiculo.manutencaoInfo && veiculo.manutencaoInfo.proxTrocaOleoKm && pKm >= veiculo.manutencaoInfo.proxTrocaOleoKm) alertaOleoMsg = `Atenção: Troca de óleo recomendada! KM atual (${pKm.toLocaleString('pt-BR')}km) atingiu ou ultrapassou limite (${veiculo.manutencaoInfo.proxTrocaOleoKm.toLocaleString('pt-BR')}km).`;
        res.status(201).json({ message: 'Abastecimento registrado!', abastecimento: { _id: result.insertedId, ...novoAbastecimento }, alertaOleo: alertaOleoMsg });
    } catch (error) { console.error('Erro registrar abastecimento:', error); res.status(500).json({ message: 'Erro registrar abastecimento.' }); }
});

// --- ROTAS DA API PARA MULTAS ---
const MULTAS_COLLECTION = 'multas';

app.post('/api/multas', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });

    const { 
        veiculoId, dataInfracao, descricao, valor, 
        dataVencimento, statusPagamento, dataPagamento 
    } = req.body;

    if (!veiculoId || !dataInfracao || !descricao || !valor || !statusPagamento) {
        return res.status(400).json({ message: "Campos obrigatórios: Veículo, Data da Infração, Descrição, Valor e Status do Pagamento." });
    }
    if (!ObjectId.isValid(veiculoId)) {
        return res.status(400).json({ message: "ID do Veículo inválido." });
    }

    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) {
            return res.status(404).json({ message: "Veículo não encontrado." });
        }

        const novaMulta = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculo.placa, // Armazenar a placa para facilitar consultas/listagens
            dataInfracao: new Date(Date.parse(dataInfracao)),
            descricao: descricao.trim(),
            valor: parseFloat(valor),
            dataVencimento: dataVencimento ? new Date(Date.parse(dataVencimento)) : null,
            statusPagamento: statusPagamento, // 'pendente', 'paga', 'recorrendo', 'cancelada'
            dataPagamento: (statusPagamento === 'paga' && dataPagamento) ? new Date(Date.parse(dataPagamento)) : null,
            dataRegistro: new Date()
        };

        if (statusPagamento === 'paga' && !novaMulta.dataPagamento) {
            // Se o status é 'paga', mas a data do pagamento não foi fornecida, usa a data atual
            novaMulta.dataPagamento = new Date(); 
        }


        const result = await db.collection(MULTAS_COLLECTION).insertOne(novaMulta);
        res.status(201).json({ 
            message: "Multa cadastrada com sucesso!", 
            multa: { _id: result.insertedId, ...novaMulta }
        });
    } catch (error) {
        console.error("Erro ao cadastrar multa:", error);
        res.status(500).json({ message: "Erro interno ao cadastrar multa." });
    }
});

app.get('/api/multas', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, statusPagamento, search } = req.query;
    
    try {
        let query = {};
        if (veiculoId && veiculoId !== 'todos') {
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID de Veículo inválido para filtro." });
            query.veiculoId = new ObjectId(veiculoId);
        }
        if (statusPagamento && statusPagamento !== 'todos') {
            query.statusPagamento = statusPagamento;
        }
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { veiculoPlaca: searchRegex },
                { descricao: searchRegex }
            ];
        }
        const multas = await db.collection(MULTAS_COLLECTION).find(query).sort({ dataInfracao: -1 }).toArray();
        res.status(200).json(multas);
    } catch (error) {
        console.error("Erro ao listar multas:", error);
        res.status(500).json({ message: "Erro interno ao listar multas." });
    }
});

app.put('/api/multas/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    const { 
        veiculoId, dataInfracao, descricao, valor, 
        dataVencimento, statusPagamento, dataPagamento 
    } = req.body;

    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID da multa inválido." });

    // Validação dos campos obrigatórios para atualização
    if (!veiculoId || !dataInfracao || !descricao || !valor || !statusPagamento) {
        return res.status(400).json({ message: "Campos obrigatórios (Veículo, Data Infração, Descrição, Valor, Status) devem ser fornecidos para atualização." });
    }
    if (!ObjectId.isValid(veiculoId)) {
        return res.status(400).json({ message: "ID do Veículo para atualização inválido." });
    }
    
    try {
        const veiculo = await db.collection('veiculos').findOne({ _id: new ObjectId(veiculoId) });
        if (!veiculo) {
            return res.status(404).json({ message: "Veículo associado à multa não encontrado." });
        }

        const dadosAtualizados = {
            veiculoId: new ObjectId(veiculoId),
            veiculoPlaca: veiculo.placa,
            dataInfracao: new Date(Date.parse(dataInfracao)),
            descricao: descricao.trim(),
            valor: parseFloat(valor),
            dataVencimento: dataVencimento ? new Date(Date.parse(dataVencimento)) : null,
            statusPagamento: statusPagamento,
            dataPagamento: (statusPagamento === 'paga' && dataPagamento) ? new Date(Date.parse(dataPagamento)) : (statusPagamento === 'paga' ? new Date() : null), // Se paga e sem data, usa hoje. Se não paga, null.
            dataUltimaModificacao: new Date()
        };
         if (statusPagamento !== 'paga') { // Garante que dataPagamento seja null se não estiver paga
            dadosAtualizados.dataPagamento = null;
        }


        const result = await db.collection(MULTAS_COLLECTION).updateOne(
            { _id: new ObjectId(id) },
            { $set: dadosAtualizados }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ message: "Multa não encontrada para atualização." });
        }
        res.status(200).json({ message: "Multa atualizada com sucesso!", multa: { _id: id, ...dadosAtualizados } });
    } catch (error) {
        console.error("Erro ao atualizar multa:", error);
        res.status(500).json({ message: "Erro interno ao atualizar multa." });
    }
});

app.delete('/api/multas/:id', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "ID da multa inválido." });

    try {
        const result = await db.collection(MULTAS_COLLECTION).deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "Multa não encontrada para exclusão." });
        }
        res.status(200).json({ message: "Multa excluída com sucesso." });
    } catch (error) {
        console.error("Erro ao excluir multa:", error);
        res.status(500).json({ message: "Erro interno ao excluir multa." });
    }
});


// --- ROTAS DA API PARA RELATÓRIOS ---
// Estas rotas precisarão ser ATUALIZADAS no futuro para incluir custos de MULTAS
app.get('/api/relatorios/gastos-detalhados', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;
    try {
        let queryManutencoes = {}; let queryAbastecimentos = {};
        if (veiculoId && veiculoId !== 'todos') { if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID veículo inválido." }); queryManutencoes.veiculoId = new ObjectId(veiculoId); queryAbastecimentos.veiculoId = new ObjectId(veiculoId); }
        const dateFilterM = getDateQuery(mes, ano); if (dateFilterM.dateMatch) queryManutencoes.dataRealizacao = dateFilterM.dateMatch;
        const dateFilterA = getDateQuery(mes, ano); if (dateFilterA.dateMatch) queryAbastecimentos.data = dateFilterA.dateMatch; // Campo 'data' para abastecimentos
        const manutencoes = await db.collection('manutencoes').find(queryManutencoes).toArray();
        const abastecimentos = await db.collection('abastecimentos').find(queryAbastecimentos).toArray();
        let gastosCombinados = []; let totalGeral = 0;
        manutencoes.forEach(m => { if (m.custo && m.custo > 0) { gastosCombinados.push({ _id: m._id, data: m.dataRealizacao, veiculoId: m.veiculoId, veiculoPlaca: m.veiculoPlaca, tipoGasto: "Manutenção", descricaoGasto: m.tipoManutencao || m.descricao || "Manutenção geral", valorGasto: parseFloat(m.custo.toFixed(2)) }); totalGeral += m.custo; } });
        abastecimentos.forEach(a => { if (a.custoTotal && a.custoTotal > 0) { gastosCombinados.push({ _id: a._id, data: a.data, veiculoId: a.veiculoId, veiculoPlaca: a.veiculoPlaca, tipoGasto: "Combustível", descricaoGasto: `Abastecimento ${a.litros.toFixed(2)}L (${a.posto || 'N/I'})`, valorGasto: parseFloat(a.custoTotal.toFixed(2)) }); totalGeral += a.custoTotal; } });
        gastosCombinados.sort((x, y) => new Date(y.data) - new Date(x.data)); 
        res.status(200).json({ detalhes: gastosCombinados, sumario: { totalGastos: parseFloat(totalGeral.toFixed(2)) } });
    } catch (error) { console.error("Erro gastos detalhados:", error); res.status(500).json({ message: "Erro gastos detalhados." }); }
});

app.get('/api/relatorios/gastos-mensais', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, ano } = req.query; const targetAno = (ano && ano !== 'todos') ? parseInt(ano) : new Date().getFullYear();
    try {
        const baseDateMatch = { $gte: new Date(Date.UTC(targetAno, 0, 1)), $lt: new Date(Date.UTC(targetAno + 1, 0, 1)) };
        let matchAbastecimento = { data: baseDateMatch, custoTotal: { $gt: 0} };
        let matchManutencao = { dataRealizacao: baseDateMatch, custo: { $gt: 0 } };
        if (veiculoId && veiculoId !== 'todos') { if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID inválido." }); matchAbastecimento.veiculoId = new ObjectId(veiculoId); matchManutencao.veiculoId = new ObjectId(veiculoId); }
        
        // Usando timezone no $month pode ser específico do MongoDB Atlas ou versões mais recentes.
        // Se der erro, pode ser necessário buscar os dados e agrupar no JS, ou ajustar para não usar timezone na query.
        const groupStageAbastecimentos = { $group: { _id: { mes: { $month: "$data" } }, totalCombustivel: { $sum: "$custoTotal" } } };
        const groupStageManutencoes = { $group: { _id: { mes: { $month: "$dataRealizacao" } }, totalManutencao: { $sum: "$custo" } } };
        const sortStage = { $sort: { "_id.mes": 1 } }; 
        const gastosCombustivel = await db.collection('abastecimentos').aggregate([ { $match: matchAbastecimento } , groupStageAbastecimentos, sortStage]).toArray();
        const gastosManutencao = await db.collection('manutencoes').aggregate([ { $match: matchManutencao }, groupStageManutencoes, sortStage]).toArray();
        const mesesNomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        let dataCombustivel = Array(12).fill(0); let dataManutencao = Array(12).fill(0);
        gastosCombustivel.forEach(item => { dataCombustivel[item._id.mes - 1] = parseFloat(item.totalCombustivel.toFixed(2)); });
        gastosManutencao.forEach(item => { dataManutencao[item._id.mes - 1] = parseFloat(item.totalManutencao.toFixed(2)); });
        let datasets = [ { label: 'Gastos com Combustível', data: dataCombustivel, backgroundColor: 'rgba(255, 159, 64, 0.5)', borderColor: 'rgba(255, 159, 64, 1)', borderWidth: 1 }, { label: 'Gastos com Manutenção', data: dataManutencao, backgroundColor: 'rgba(75, 192, 192, 0.5)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 } ];
        res.status(200).json({ labels: mesesNomes, datasets });
    } catch (error) { console.error("Erro gastos mensais:", error); res.status(500).json({ message: "Erro gastos mensais." }); }
});

app.get('/api/relatorios/analise-combustivel', simpleAuthCheck, async (req, res) => {
    if (!db) return res.status(500).json({ message: "DB não conectado." });
    const { veiculoId, mes, ano } = req.query;
    console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Filtros recebidos: VeiculoID=${veiculoId}, Mes=${mes}, Ano=${ano}`);
    try {
        let queryAbastecimentos = {}; 
        if (veiculoId && veiculoId !== 'todos') { 
            if (!ObjectId.isValid(veiculoId)) return res.status(400).json({ message: "ID inválido." }); 
            queryAbastecimentos.veiculoId = new ObjectId(veiculoId); 
        }
        const dateFilter = getDateQuery(mes, ano); 
        if (dateFilter.dateMatch) {
            queryAbastecimentos.data = dateFilter.dateMatch;
        }
        console.log("[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Query MongoDB:", JSON.stringify(queryAbastecimentos));

        const abastecimentos = await db.collection('abastecimentos')
            .find(queryAbastecimentos)
            .sort({ veiculoId: 1, data: 1, quilometragemAtual: 1 }) // ESSENCIAL PARA O CÁLCULO CORRETO
            .toArray();
        
        console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Abastecimentos encontrados: ${abastecimentos.length}`);

        let detalhesFormatados = []; 
        let sumario = { totalGastoCombustivel: 0, totalLitros: 0, totalKmRodados: 0 }; 
        let ultimoKmPorVeiculo = {};
        let trechosValidosParaConsumo = 0;

        for (const a of abastecimentos) {
            sumario.totalGastoCombustivel += a.custoTotal; 
            sumario.totalLitros += a.litros; 
            const vIdStr = a.veiculoId.toString(); 
            let kmRodados = null; 
            let consumoNoTrecho = null;

            console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Processando abastecimento: Veículo ${a.veiculoPlaca}, Data ${a.data}, KM ${a.quilometragemAtual}, Litros ${a.litros}`);
            console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] ultimoKmPorVeiculo[${vIdStr}]: ${ultimoKmPorVeiculo[vIdStr]}`);

            if (ultimoKmPorVeiculo[vIdStr] !== undefined && a.quilometragemAtual > ultimoKmPorVeiculo[vIdStr]) { 
                kmRodados = a.quilometragemAtual - ultimoKmPorVeiculo[vIdStr]; 
                sumario.totalKmRodados += kmRodados; 
                trechosValidosParaConsumo++;
                console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] KM Rodados neste trecho: ${kmRodados}`);
                if (a.litros > 0) { 
                    consumoNoTrecho = parseFloat((kmRodados / a.litros).toFixed(2)); 
                } 
            } else {
                console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Não calculou KM rodados. ultimoKm: ${ultimoKmPorVeiculo[vIdStr]}, atualKm: ${a.quilometragemAtual}`);
            }
            
            detalhesFormatados.push({ ...a, kmRodados: kmRodados, consumoNoTrecho: consumoNoTrecho }); 
            ultimoKmPorVeiculo[vIdStr] = a.quilometragemAtual;
        }
        
        console.log(`[DEPURAÇÃO ANÁLISE COMBUSTÍVEL] Final - Total KM Rodados: ${sumario.totalKmRodados}, Trechos Válidos: ${trechosValidosParaConsumo}, Total Litros: ${sumario.totalLitros}`);

        sumario.totalGastoCombustivel = parseFloat(sumario.totalGastoCombustivel.toFixed(2)); 
        sumario.totalLitros = parseFloat(sumario.totalLitros.toFixed(2)); 
        sumario.totalKmRodados = parseFloat(sumario.totalKmRodados.toFixed(2));
        sumario.consumoMedioGeral = sumario.totalLitros > 0 && sumario.totalKmRodados > 0 ? parseFloat((sumario.totalKmRodados / sumario.totalLitros).toFixed(2)) : 0;
        sumario.custoMedioPorKm = sumario.totalKmRodados > 0 ? parseFloat((sumario.totalGastoCombustivel / sumario.totalKmRodados).toFixed(2)) : 0;
        sumario.precoMedioLitro = sumario.totalLitros > 0 ? parseFloat((sumario.totalGastoCombustivel / sumario.totalLitros).toFixed(3)) : 0;
        
        res.status(200).json({ detalhes: detalhesFormatados.sort((x,y) => new Date(y.data) - new Date(x.data)), sumario });
    } catch (error) { 
        console.error("Erro analise combustivel:", error); 
        res.status(500).json({ message: "Erro analise combustivel." }); 
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
