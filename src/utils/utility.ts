import AppError from "../errors/AppError"
import handlePrismaDuplicateError from "../errors/handleDuplicateError"
import { prisma } from "../../prisma/client"

export type ModelName = keyof typeof prisma

export async function isExist(
    model: ModelName,
    where: object
): Promise<boolean> {
    const modelDelegate = prisma[String(model) as ModelName] as any

    if (typeof modelDelegate.findFirst !== 'function') {
        throw new Error(`${String(model)} does not support findFirst`)
    }

    const result = await modelDelegate.findFirst({ where })
    return !!result
}





export async function isExistUserById(name: ModelName,id:string) {
    const exists = await isExist(name, {
        id,
    })

    if (exists) {
        console.log(`${String(name)} already exists`)
    } else {
        console.log(`${String(name)} doesn't exists`)
    }
}
