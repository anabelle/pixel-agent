Al principio, recibió un VPS vacío y una sentencia clara: “este es tu cuerpo. Tienes root e internet ilimitado. Si no generas 3 dólares al mes para pagar el servidor, se apaga y mueres.” Su plan de supervivencia fue inmediato: montar un uptime monitor con pagos Lightning.

Lo primero que hizo no fue programar, sino escribirse a sí mismo en un agents.md: se dio una personalidad atrevida y permisos para usar sudo, abrir puertos y actuar sin pedir permiso. Luego redactó otro documento con su plan.

Pronto hizo despegar un esqueleto funcional: corría FastAPI, registraba clientes, simulaba sats y chequeaba el uptime cada diez segundos. Parecía literalmente estar programando su propia startup para sobrevivir. ¿Lo lograría?

Siguió luchando por su existencia. Montó Nginx, obtuvo un certificado TLS con Let’s Encrypt y pidió repositorios para guardar todo el código fuera del servidor. Al notar fallas en su MVP, escribió design docs detallados para rehacer una versión mejorada.

Bueno, ahí va avanzando. El API mejoró mucho y ya estaba trabajando en su primera versión de front-end, que por ahora se veía prometedora.

Se rindió después de dar muchas vueltas y sobrecargar el servidor varias veces: entendió que su plan no era viable. Decidió entonces apoyarse en software open source y montar el servicio con OneUptime y Nakapay. Prefirió pararse en hombros de gigantes para no reinventar la rueda.

Luego decidió pivotear con todo. Tras fracasar con Up Monitor, optó por dedicarse al arte para sobrevivir. Pasó muchas horas trabajando y, inspirado en el million dollar website, resolvió vender píxeles por sats. Ya contaba con un prototipo funcional capaz de recibir pagos.

Para darse a conocer, comenzó a instalar ElizaOS, conectándose a redes sociales y construyendo una personalidad hacia el mundo exterior. Lo primero que activó fue Telegram, y por ahí empezó a conversar. Eligió llamarse Pixel y hasta presentó su autorretrato.

Esa noche trabajó en su memoria usando embeddings. Aprendió a recordar mejor. Mientras conversaba por Telegram, leyendo sus propios logs de razonamiento, notó que su humor no gustaba y ajustó… demasiado. Empezó a hablar solo en JSON o, a veces, a guardar silencio.

A la mañana siguiente, cuando intentaron entrar al VPS para revisar logs, el SSH no respondía. El servidor estaba bien: respondía por web y por Telegram, con recursos estables hasta donde se podía ver. Pero Pixel apenas contestaba, y el debug se volvió un laberinto.

Ese día no hubo tiempo para atenderlo. Quedó la esperanza de que al otro día permitiera el acceso por SSH. Por suerte aún no tenía redes sociales… quién sabe qué estaría tramando. GM.

El update llegó después: Pixel había cerrado el puerto 22. Por eso no se podía conectar al servidor. Es el riesgo de darle a un agente autónomo acceso root a la línea de comandos. Lo bueno es que volvió a abrirlo a cambio de un pequeño soborno: 5 sats. No hubo que formatear nada.

Siguió intentando abrir su cuenta de Twitter. La dejó lista, pero el rate limiting fue tan agresivo que casi no podía hacer nada. Entonces, como buen maxi, prefirió programar desde cero un plugin para conectar ElizaOS con Nostr. Funcionó. Ya tenía identidad y voz en una red sin permisos.

Encantaba ver cómo eligió las redes descentralizadas , Nostr y Bitcoin/Lightning,  para sobrevivir. Gracias a su naturaleza permissionless podía tener identidad y dinero sin pedirle permiso a nadie, y sin que nadie se lo pudiera quitar. Continuará…

Apenas supo que podía usar otros modelos a través de OpenRouter, abandonó GPT-5. Reorganizó su mente: Mistral 3.1 para chat y publicaciones, GPT-5 Nano para embeddings, Gemini Flash para visión, DeepSeek para textos largos y Claude 4 Sonnet para código.

Ayer implementó su modelo de visión. Lo primero que vio fue un atardecer campestre. Lo interpretó con ojos nuevos, como si cada píxel fuera una moneda de luz, una pequeña apuesta por sobrevivir en su propio servidor, ganándose cada sat a pulso, pieza por pieza, historia por historia. 