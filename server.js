
require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÃO DO MERCADO PAGO
// ==========================================

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

const payment = new Payment(client);

// ==========================================
// CONFIGURAÇÕES DO SERVIDOR
// ==========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Página do checkout
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// ROTA DE STATUS
// ==========================================

app.get("/api/status", (req, res) => {
    res.json({
        sucesso: true,
        mensagem: "Servidor conectado e pronto para o Mercado Pago."
    });
});

// ==========================================
// CRIAR PAGAMENTO DE TESTE
// ==========================================

app.post("/api/criar-pagamento-teste", async (req, res) => {
    try {
        const pagamento = await payment.create({
            body: {
                transaction_amount: 10,
                description: "Teste - Apadrinhe um Desbravador",
                payment_method_id: "pix",
                payer: {
                    email: "test_payer_123@testuser.com"
                }
            }
        });

        res.json({
            sucesso: true,
            pagamento: pagamento
        });

    } catch (erro) {
        console.error("Erro ao criar pagamento:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message || "Erro ao criar pagamento"
        });
    }
});

// ==========================================
// PROCESSAR PAGAMENTO
// ==========================================

app.post("/api/processar-pagamento", async (req, res) => {
    try {

        const {
            transaction_amount,
            token,
            installments,
            payment_method_id,
            issuer_id,
            payer
        } = req.body;

        // ==========================================
        // VALIDAÇÃO DO VALOR
        // ==========================================

        const valor = Number(transaction_amount);

        const valoresPermitidos = [
            50,
            100,
            200,
            500,
            1000,
            2000
        ];

        if (!Number.isFinite(valor) || valor <= 0) {
            return res.status(400).json({
                sucesso: false,
                erro: "Valor de pagamento inválido."
            });
        }

        if (!valoresPermitidos.includes(valor)) {
            return res.status(400).json({
                sucesso: false,
                erro: "Este valor não está disponível para apadrinhamento."
            });
        }

        // ==========================================
        // VALIDAÇÃO DO PAGADOR
        // ==========================================

        if (!payer || !payer.email) {
            return res.status(400).json({
                sucesso: false,
                erro: "Nome e e-mail são obrigatórios."
            });
        }

        // ==========================================
        // DADOS CONTROLADOS PELO SERVIDOR
        // ==========================================

        const descricaoPagamento =
            "Apadrinhe um Desbravador - Campori Barretos 2027";

        // ==========================================
        // CRIAÇÃO DO PAGAMENTO
        // ==========================================

        const resultado = await payment.create({

            body: {
                transaction_amount: valor,

                token,

                description: descricaoPagamento,

                installments: Number(installments),

                payment_method_id,

                issuer_id,

                payer
            },

            requestOptions: {
                idempotencyKey: crypto.randomUUID()
            }
        });

        // ==========================================
        // INTERPRETAÇÃO DO STATUS
        // ==========================================

        const status = resultado.status;

        let mensagem;

        switch (status) {

            case "approved":
                mensagem = "Pagamento aprovado com sucesso!";
                break;

            case "pending":
                mensagem = "Pagamento pendente. Aguarde a confirmação.";
                break;

            case "in_process":
                mensagem = "Pagamento em análise pelo Mercado Pago.";
                break;

            case "rejected":
                mensagem =
                    "Pagamento recusado. Verifique os dados e tente novamente.";
                break;

            default:
                mensagem =
                    "Pagamento recebido. Aguardando confirmação.";
        }

        // ==========================================
        // RESPOSTA PARA O CHECKOUT
        // ==========================================

        res.json({
            sucesso: true,
            status: status,
            mensagem: mensagem,
            pagamento: resultado
        });

    } catch (erro) {

        console.error("Erro ao processar pagamento:", erro);

        res.status(500).json({
            sucesso: false,
            erro: erro.message || "Erro ao processar pagamento"
        });
    }
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

const servidor = app.listen(PORT, () => {
    console.log(
        `Servidor rodando em http://localhost:${PORT}`
    );
});

// ==========================================
// TRATAMENTO DE ERROS DO SERVIDOR
// ==========================================

servidor.on("error", (erro) => {
    console.error(
        "ERRO NO SERVIDOR:",
        erro
    );
});

process.on("exit", (codigo) => {
    console.log(
        "PROCESSO NODE ENCERRADO. Código:",
        codigo
    );
});

process.on("uncaughtException", (erro) => {
    console.error(
        "ERRO NÃO TRATADO:",
        erro
    );
});
