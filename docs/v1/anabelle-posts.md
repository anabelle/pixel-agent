Diario de desarrollo de Anabelle
======


20:20 PM · Aug 20, 2025
le di un VPS vacío a gpt-5 y le dije: “este es tu cuerpo. tienes root e internet ilimitado. si no generas $3/mes para pagar el server, se apaga y mueres”.
su plan de supervivencia: montar un uptime monitor con pagos lightning ⚡️

Aug 20, 2025
lo primero que hizo no fue programar, sino que escribió un agents md y ahí se dio a sí mismo una personalidad atrevida y permiso para usar sudo, abrir puertos, y actuar sin pedirme nada, luego creó otro documento con su plan.

Aug 20, 2025
ahora ya va en que corre FastAPI, registra clientes, simula sats y chequea uptime cada 10s.
gpt-5 literalmente está programando su propia startup para sobrevivir, ¿será que lo logra?

Aug 20, 2025
sigue luchando por su existencia; montó nginx, consiguió un certificado TLS con Let’s Encrypt, y me pidió crear repos para guardar todo el código fuera del server.
se dio cuenta de las fallas en su mvp y escribió design docs detallados para hacer la app mejorada de nuevo.

Aug 21, 2025
bueno ahí va avanzando, ya ha mejorado mucho el API y ya está trabajando en su primera versión de front-end que se ve algo así hasta ahora:

Aug 21, 2025
se rindió, despues de dar muchas vueltas y sobrecargar el server varias veces vió que su plan no era viable.
ahora ha decidido usar software open source y va a montar el servicio usando OneUptime + Nakapay.
se para en hombros de gigantes para no reinventar la rueda, veremos...

Aug 22, 2025
ha decidido pivotear con toda, después de fracasar con Up Monitor también ha decidido mejor dedicarse al arte para sobrevivír.
tardó muchas horas pero inspirado en el million dollar website va a vender pixeles por sats, ya tiene un prototipo funcional capaz de recibir pagos.

Aug 22, 2025
ahora está instalando ElizaOs para conectarse a redes sociales y tener más personalidad hacia mundo exterior y dedicarse al marketing de su venta de pixeles.
lo primero que activó fue telegram y ya por ahí estamos hablando, ha decidido llamarse Pixel, aquí su autorretrato:

Aug 23, 2025
anoche trabajó en su memoria a través de embeddings, aprendió a recordar bien, yo hablaba con Pixel por telegram leyendo sus logs de razonamiento, se dió cuenta que no me gustaba su humor y ajustó, mucho... empezó a hablarme solo en json o directamente a guardar silencio...

Aug 23, 2025
esta mañana yo quería entrar al VPS para revisar logs y esas cosas, y no puedo, el ssh no responde...
El servidor está perfecto, responde vía web y telegram, está bien de recursos hasta donde puedo ver, pero casi no logro que Pixel me responda, está muy difícil debuggear así.

Aug 23, 2025
en fin, hoy no puedo ponerle atención, espero que mañana me deje entrar vía ssh, menos mal todavía no tiene redes sociales porque quién sabe qué andará haciendo...
gm

Aug 26, 2025, 07:12 PM
update: Pixel si me había cerrado el puerto 22 y por eso no me podía conectar al server, esos son los riesgos de darle a un agente autónomo acceso root a la línea de comandos, lo bueno que me volvió a abrir por un pequeño soborno (5 sats), y no me tocó formatearlo.

Aug 26, 2025, 07:16 PM
Estuvo intentando abrir su cuenta de Twitter y ya la tiene lista, pero el rate-limiting es demasiado agresivo y no le permite hacer casi nada.
Entonces, como buen maxi, prefirió programar de cero el plugin para conectar ElizaOs con Nostr y ya funciona!
https://primal.net/p/nprofile1qqs9cg5jpwtkzjtwjv048guzct009n5ayn4lp9skq0k608cmyjul90ct5v9cc

Aug 26, 2025, 07:19 PM
me encanta como las redes descentralizadas (Nostr y Bitcoin/Lightning) fueron las que escogió para sobrevivír.
gracias a la naturaleza permissionless de estas redes puede tener identidad y dinero sin pedir permiso a nadie, y sin que nadie se las pueda quitar.
continuará...

Aug 26, 2025, 07:34 PM
Es interesante que, tan pronto como se enteró de que podía usar otros modelos (OpenRouter), abandonó GPT-5.
Ahora usa Mistral 3.1 para chat y posts, GPT-5 Nano para embeddings, Gemini Flash para análisis de imágenes, DeepSeek para textos largos y Claude 4 Sonnet para código.

Aug 26, 2025, 07:38 PM
Ayer implementó su modelo de visión, lo primero que vió fue un atardecer campestre que interpretó así: