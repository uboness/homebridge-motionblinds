export class MessageIdGenerator {

    private lastId: bigint | undefined;

    next(): string {
        // ex: 20200321134209916
        const date = new Date()
        const yyyy = date.getFullYear()
        const MM = (date.getMonth() + 1).toString().padStart(2, '0')
        const dd = date
            .getDate()
            .toString()
            .padStart(2, '0')
        const hh = date
            .getHours()
            .toString()
            .padStart(2, '0')
        const mm = date
            .getMinutes()
            .toString()
            .padStart(2, '0')
        const ss = date
            .getSeconds()
            .toString()
            .padStart(2, '0')
        const sss = date
            .getMilliseconds()
            .toString()
            .padStart(3, '0')
        let messageIdStr = `${yyyy}${MM}${dd}${hh}${mm}${ss}${sss}`

        // Ensure this messageId is greater than the last sent one
        let messageId = BigInt(messageIdStr)
        if (this.lastId != undefined) {
            if (messageId <= this.lastId) {
                messageId = this.lastId + BigInt(1)
                messageIdStr = messageId.toString()
            }
        }
        this.lastId = messageId

        return messageIdStr
    }
}