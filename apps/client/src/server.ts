import { config } from './config'
import { app, logger } from '@/app'

app.listen(config.PORT, () => {
  logger.log('info', `Server running at http://localhost:${config.PORT}`)
})