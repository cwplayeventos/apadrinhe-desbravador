require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const path = require("path");
const { MercadoPagoConfig, Payment } = require("mercadopago");

const app = express();
const PORT = process.env.PORT || 3000;

const WEBHOOK_URL =
    "https://apadrinhe-desbravador.onrender.com/api/webhook/mercadopago";

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

const payment = new Payment(client);


/* =========================================================
   ARMAZENAMENTO TEMPORÁRIO DOS STATUS
   =========================================================

   IMPORTANTE:
   Isso serve para o primeiro teste.

   Como o Render pode reiniciar o servidor, posteriormente
   vamos colocar os pagamentos em um armazenamento permanente.
========================================================= */

const pagamentos = new Map();


/* =========================================================
   MIDDLEWARES
========================================================= */

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));


/* =========================================================
   STATUS DO SERVIDOR
========================================================= */

app.get("/api/status", (req, res) => {

    res.json({
        sucesso: true,
        mensagem: "Servidor conectado e pronto para o Mercado Pago.",
        webhook: WEBHOOK_URL
    });

});


/* =========================================================
   PAGAMENTO PIX DE TESTE
========================================================= */

app.post("/api/criar-pagamento-teste", async (req, res) => {

    try {

        const pagamento = await payment.create({

            body: {

                transaction_amount: 10,

                description:
                    "Teste - Apadrinhe um Desbravador",

                payment_method_id: "pix",

                payer: {
                    email: "test_payer_123@testuser.com"
                },

                notification_url: WEBHOOK_URL

            },

            requestOptions: {
                idempotencyKey: crypto.randomUUID()
            }

        });


        pagamentos.set(
            String(pagamento.id),
            {
                id: pagamento.id,
                status: pagamento.status,
                status_detail: pagamento.status_detail,
                atualizadoEm: new Date().toISOString()
            }
        );


        res.json({

            sucesso: true,

            pagamento: pagamento

        });


    } catch (erro) {

        console.error(
            "Erro ao criar pagamento de teste:",
            erro
        );

        res.status(500).json({

            sucesso: false,

            erro:
                erro.message ||
                "Erro ao criar pagamento"

        });

    }

});


/* =========================================================
   CRIAR PIX
========================================================= */

app.post("/api/criar-pix", async (req, res) => {

    try {

        const {
            transaction_amount,
            nome,
            email
        } = req.body;


        const valor = Number(transaction_amount);


        const valoresPermitidos = [
            50,
            100,
            200,
            500,
            1000,
            2000
        ];


        /* ---------------------------------------------
           VALIDAÇÃO DO VALOR
        --------------------------------------------- */

        if (!Number.isFinite(valor) || valor <= 0) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Valor de pagamento inválido."

            });

        }


        if (!valoresPermitidos.includes(valor)) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Este valor não está disponível para apadrinhamento."

            });

        }


        /* ---------------------------------------------
           VALIDAÇÃO DO NOME
        --------------------------------------------- */

        if (!nome || nome.trim().length < 2) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Informe seu nome."

            });

        }


        /* ---------------------------------------------
           VALIDAÇÃO DO E-MAIL
        --------------------------------------------- */

        if (!email || !email.includes("@")) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Informe um e-mail válido."

            });

        }


        /* ---------------------------------------------
           DESCRIÇÃO
        --------------------------------------------- */

        const descricaoPagamento =
            "Apadrinhe um Desbravador - Campori Barretos 2027";


        /* ---------------------------------------------
           CRIAÇÃO DO PIX
        --------------------------------------------- */

        const resultado = await payment.create({

            body: {

                transaction_amount: valor,

                description:
                    descricaoPagamento,

                payment_method_id:
                    "pix",

                payer: {

                    email:
                        email.trim(),

                    first_name:
                        nome.trim()

                },

                /*
                 * URL que receberá a confirmação
                 * automática do Mercado Pago.
                 */

                notification_url:
                    WEBHOOK_URL

            },

            requestOptions: {

                idempotencyKey:
                    crypto.randomUUID()

            }

        });


        /* ---------------------------------------------
           SALVAR STATUS INICIAL
        --------------------------------------------- */

        pagamentos.set(

            String(resultado.id),

            {

                id:
                    resultado.id,

                status:
                    resultado.status,

                status_detail:
                    resultado.status_detail,

                nome:
                    nome.trim(),

                email:
                    email.trim(),

                valor:
                    valor,

                criadoEm:
                    new Date().toISOString(),

                atualizadoEm:
                    new Date().toISOString()

            }

        );


        /* ---------------------------------------------
           DADOS DO PIX
        --------------------------------------------- */

        const transactionData =
            resultado?.point_of_interaction
                ?.transaction_data;


        if (!transactionData) {

            console.error(
                "Mercado Pago não retornou os dados do PIX:",
                resultado
            );

            return res.status(500).json({

                sucesso: false,

                erro:
                    "O Mercado Pago não retornou os dados do PIX."

            });

        }


        /* ---------------------------------------------
           RESPOSTA
        --------------------------------------------- */

        res.json({

            sucesso: true,

            status:
                resultado.status,

            status_detail:
                resultado.status_detail,

            pagamento_id:
                resultado.id,

            qr_code:
                transactionData.qr_code,

            qr_code_base64:
                transactionData.qr_code_base64,

            ticket_url:
                transactionData.ticket_url || null,

            expiracao:
                resultado.date_of_expiration || null

        });


    } catch (erro) {

        console.error(
            "Erro ao criar pagamento PIX:",
            erro
        );

        res.status(500).json({

            sucesso: false,

            erro:
                erro.message ||
                "Erro ao criar pagamento PIX."

        });

    }

});


/* =========================================================
   WEBHOOK MERCADO PAGO
========================================================= */

app.post("/api/webhook/mercadopago", async (req, res) => {

    try {

        console.log(
            "=========================================="
        );

        console.log(
            "WEBHOOK MERCADO PAGO RECEBIDO"
        );

        console.log(
            "Headers:",
            req.headers
        );

        console.log(
            "Body:",
            JSON.stringify(req.body, null, 2)
        );


        /*
         * O Mercado Pago envia o ID do pagamento
         * dentro de data.id.
         */

        const tipo =
            req.body?.type;

        const pagamentoId =
            req.body?.data?.id;


        console.log(
            "Tipo:",
            tipo
        );

        console.log(
            "Pagamento ID:",
            pagamentoId
        );


        /*
         * Respondemos rapidamente ao Mercado Pago.
         * Depois processamos a informação.
         */

        res.sendStatus(200);


        if (!pagamentoId) {

            console.log(
                "Webhook recebido sem ID de pagamento."
            );

            return;

        }


        /*
         * Só processaremos notificações de pagamento.
         */

        if (
            tipo &&
            tipo !== "payment"
        ) {

            console.log(
                "Evento ignorado:",
                tipo
            );

            return;

        }


        /* ---------------------------------------------
           CONSULTAR PAGAMENTO NO MERCADO PAGO
        --------------------------------------------- */

        const pagamento =
            await payment.get({

                id:
                    String(pagamentoId)

            });


        console.log(
            "Pagamento consultado no Mercado Pago:"
        );

        console.log(
            JSON.stringify(
                pagamento,
                null,
                2
            )
        );


        /* ---------------------------------------------
           ATUALIZAR STATUS
        --------------------------------------------- */

        const pagamentoExistente =
            pagamentos.get(
                String(pagamentoId)
            ) || {};


        pagamentos.set(

            String(pagamentoId),

            {

                ...pagamentoExistente,

                id:
                    pagamento.id,

                status:
                    pagamento.status,

                status_detail:
                    pagamento.status_detail,

                atualizadoEm:
                    new Date().toISOString()

            }

        );


        /* ---------------------------------------------
           PAGAMENTO APROVADO
        --------------------------------------------- */

        if (
            pagamento.status ===
            "approved"
        ) {

            console.log(
                "=========================================="
            );

            console.log(
                "PAGAMENTO APROVADO!"
            );

            console.log(
                "ID:",
                pagamento.id
            );

            console.log(
                "Valor:",
                pagamento.transaction_amount
            );

            console.log(
                "E-mail:",
                pagamento.payer?.email
            );

            console.log(
                "=========================================="
            );

        }


    } catch (erro) {

        console.error(
            "Erro ao processar Webhook do Mercado Pago:",
            erro
        );

    }

});


/* =========================================================
   CONSULTAR STATUS DE UM PAGAMENTO
========================================================= */

app.get("/api/pagamento/:id", async (req, res) => {

    try {

        const id =
            String(req.params.id);


        /*
         * Primeiro tentamos consultar diretamente
         * no Mercado Pago.
         */

        const pagamento =
            await payment.get({
                id
            });


        /*
         * Atualizamos nosso armazenamento temporário.
         */

        const existente =
            pagamentos.get(id) || {};


        pagamentos.set(

            id,

            {

                ...existente,

                id:
                    pagamento.id,

                status:
                    pagamento.status,

                status_detail:
                    pagamento.status_detail,

                atualizadoEm:
                    new Date().toISOString()

            }

        );


        res.json({

            sucesso: true,

            pagamento_id:
                pagamento.id,

            status:
                pagamento.status,

            status_detail:
                pagamento.status_detail,

            aprovado:
                pagamento.status ===
                "approved"

        });


    } catch (erro) {

        console.error(
            "Erro ao consultar pagamento:",
            erro
        );


        res.status(500).json({

            sucesso: false,

            erro:
                erro.message ||
                "Não foi possível consultar o pagamento."

        });

    }

});


/* =========================================================
   PAGAMENTO COM CARTÃO
========================================================= */

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


        const valor =
            Number(transaction_amount);


        const valoresPermitidos = [
            50,
            100,
            200,
            500,
            1000,
            2000
        ];


        /* ---------------------------------------------
           VALIDAÇÃO DO VALOR
        --------------------------------------------- */

        if (
            !Number.isFinite(valor) ||
            valor <= 0
        ) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Valor de pagamento inválido."

            });

        }


        if (
            !valoresPermitidos.includes(valor)
        ) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Este valor não está disponível para apadrinhamento."

            });

        }


        /* ---------------------------------------------
           VALIDAÇÃO DO PAGADOR
        --------------------------------------------- */

        if (
            !payer ||
            !payer.email
        ) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Nome e e-mail são obrigatórios."

            });

        }


        /* ---------------------------------------------
           DESCRIÇÃO
        --------------------------------------------- */

        const descricaoPagamento =
            "Apadrinhe um Desbravador - Campori Barretos 2027";


        /* ---------------------------------------------
           CRIAÇÃO DO PAGAMENTO
        --------------------------------------------- */

        const resultado =
            await payment.create({

                body: {

                    transaction_amount:
                        valor,

                    token,

                    description:
                        descricaoPagamento,

                    installments:
                        Number(installments),

                    payment_method_id,

                    issuer_id,

                    payer,

                    notification_url:
                        WEBHOOK_URL

                },

                requestOptions: {

                    idempotencyKey:
                        crypto.randomUUID()

                }

            });


        /* ---------------------------------------------
           SALVAR STATUS
        --------------------------------------------- */

        pagamentos.set(

            String(resultado.id),

            {

                id:
                    resultado.id,

                status:
                    resultado.status,

                status_detail:
                    resultado.status_detail,

                valor:
                    valor,

                criadoEm:
                    new Date().toISOString(),

                atualizadoEm:
                    new Date().toISOString()

            }

        );


        /* ---------------------------------------------
           MENSAGEM
        --------------------------------------------- */

        const status =
            resultado.status;


        let mensagem;


        switch (status) {

            case "approved":

                mensagem =
                    "Pagamento aprovado com sucesso!";

                break;


            case "pending":

                mensagem =
                    "Pagamento pendente. Aguarde a confirmação.";

                break;


            case "in_process":

                mensagem =
                    "Pagamento em análise pelo Mercado Pago.";

                break;


            case "rejected":

                mensagem =
                    "Pagamento recusado. Verifique os dados e tente novamente.";

                break;


            default:

                mensagem =
                    "Pagamento recebido. Aguardando confirmação.";

        }


        /* ---------------------------------------------
           RESPOSTA
        --------------------------------------------- */

        res.json({

            sucesso: true,

            status:
                status,

            mensagem:
                mensagem,

            pagamento:
                resultado

        });


    } catch (erro) {

        console.error(
            "Erro ao processar pagamento:",
            erro
        );

        res.status(500).json({

            sucesso: false,

            erro:
                erro.message ||
                "Erro ao processar pagamento"

        });

    }

});


/* =========================================================
   INICIALIZAÇÃO DO SERVIDOR
========================================================= */

const servidor =
    app.listen(

        PORT,

        () => {

            console.log(
                `Servidor rodando na porta ${PORT}`
            );

            console.log(
                `Webhook: ${WEBHOOK_URL}`
            );

        }

    );


/* =========================================================
   TRATAMENTO DE ERROS
========================================================= */

servidor.on(
    "error",
    (erro) => {

        console.error(
            "ERRO NO SERVIDOR:",
            erro

        );

    }
);


process.on(
    "exit",
    (codigo) => {

        console.log(
            "PROCESSO NODE ENCERRADO. Código:",
            codigo

        );

    }
);


process.on(
    "uncaughtException",
    (erro) => {

        console.error(
            "ERRO NÃO TRATADO:",
            erro

        );

    }
);
