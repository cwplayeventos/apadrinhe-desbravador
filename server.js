require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do Mercado Pago
const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

const payment = new Payment(client);

// Configurações do servidor
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Página do checkout
app.use(express.static(path.join(__dirname, "public")));

// Rota de teste
app.get("/api/status", (req, res) => {
    res.json({
        sucesso: true,
        mensagem: "Servidor conectado e pronto para o Mercado Pago."
    });
});
//Criar pagamento de teste
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
app.post("/api/processar-pagamento", async (req, res) => {
    try {
        const {
            transaction_amount,
            token,
            description,
            installments,
            payment_method_id,
            issuer_id,
            payer
        } = req.body;

        const resultado = await payment.create({
            body: {
                transaction_amount: Number(transaction_amount),
                token,
                description,
                installments: Number(installments),
                payment_method_id,
                issuer_id,
                payer
            },
            requestOptions: {
                idempotencyKey: crypto.randomUUID()
            }
        });

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
        mensagem = "Pagamento recusado. Verifique os dados e tente novamente.";
        break;

    default:
        mensagem = "Pagamento recebido. Aguardando confirmação.";
}

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
const servidor = app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

servidor.on("error", (erro) => {
    console.error("ERRO NO SERVIDOR:", erro);
});

process.on("exit", (codigo) => {
    console.log("PROCESSO NODE ENCERRADO. Código:", codigo);
});

process.on("uncaughtException", (erro) => {
    console.error("ERRO NÃO TRATADO:", erro);
});
