import {createQueryBuilder, EntityRepository, Repository} from 'typeorm';
import {Event} from './event.entity';
import {EventDto} from "./event.dto";
import {EventSearchQuery} from "./eventsearch.validator";
import {Operators, QueryBuilderHelper} from "../utils/QueryBuilderHelper";

@EntityRepository(Event)
export class EventRepository extends Repository<Event> {
    constructor() {
        super()
    }

    async add(eventDto: EventDto): Promise<Event> {
        return await super.save(eventDto)
    }

    async findById(id: string): Promise<Event> {
        return await super.findOneOrFail(id, {relations: ["eventInputs", "eventOutputs"]})
    }

    async findAll(): Promise<Event[]> {
        return await super.find({
            order: {eventId: "ASC"},
            relations: ["eventInputs", "eventOutputs"]
        })
    }

    /**
     * Performs a SQL query applying the filters according to the @param
     * @param eventSearchQuery
     */
    async search(eventSearchQuery: EventSearchQuery): Promise<{ count: number; query: EventSearchQuery; eventCollection: any; }> {
        console.log('event.repository.search query=', eventSearchQuery)

        const queryBuilderHelper = new QueryBuilderHelper()

        // TODO -> add filter by expiryDate & ? option: OR or AND in where ?
        /** NOTE: The name of "whereFunctions" need to be the same name of filter/properties of EventSearchQuery */
        const whereFunctions = {
            eventId(eventIds: string[] | string): string {
                return queryBuilderHelper.commonWhereStatement('event.eventid', Operators.IN, eventIds)
            },
            createdOnStart(date: string): string {
                return queryBuilderHelper.commonWhereStatement('event.createdOn::date', Operators.MTE, date)
            },
            createdOnEnd(date: string): string {
                return queryBuilderHelper.commonWhereStatement('event.createdOn::date', Operators.LTE, date)
            },
            productCode(productsCode: string[] | string): string {
                return queryBuilderHelper.jsonWhereStatement('eventinput.eventinputdata', 'productCode', Operators.IN, productsCode)
            },
            batch(batches: string[] | string): string {
                return queryBuilderHelper.jsonWhereStatement('eventinput.eventinputdata', 'batch', Operators.IN, batches)
            },
            serialNumber(serialNumbers: string[] | string): string {
                return queryBuilderHelper.jsonWhereStatement('eventinput.eventinputdata', 'serialNumber', Operators.IN, serialNumbers)
            },
            nameMedicinalProduct(nameMedicinalProducts: string[] | string): string {
                return queryBuilderHelper.jsonWhereStatement(
                    'eventoutput.eventoutputdata',
                    'nameMedicinalProduct',
                    Operators.IN,
                    nameMedicinalProducts
                )
            },
            productStatus(productsStatus: string[] | string): string {
                return queryBuilderHelper.jsonWhereStatement('eventoutput.eventoutputdata', 'productStatus', Operators.IN, productsStatus)
            },
            // expiryDateStart(date: string): string {
            //     return `eventinput.eventinputdata ->> 'expiryDate' >= '${date}'`
            // },
            // expiryDateEnd(date: string): string {
            //     return `eventinput.eventinputdata ->> 'expiryDate' <= '${date}'`
            // },
            snCheckLocation(snCheckLocations: string[] | string): string {
                const arr = Array.isArray(snCheckLocations) ? snCheckLocations : [snCheckLocations]
                let stmt = '('
                arr.forEach((latLong, index) => {
                    const [lat, long] = latLong.split(',')
                    const latWhereStmt = queryBuilderHelper.deepJsonWhereStatement(
                        'eventinput.eventinputdata',
                        ['snCheckLocation', 'latitude'],
                        Operators.EQL,
                        lat
                    )
                    const longWhereStmt = queryBuilderHelper.deepJsonWhereStatement(
                        'eventinput.eventinputdata',
                        ['snCheckLocation', 'longitude'],
                        Operators.EQL,
                        long
                    )
                    const condition = (index == 0) ? `(${latWhereStmt} AND ${longWhereStmt})` : `OR (${latWhereStmt} AND ${longWhereStmt})`
                    stmt += condition
                })
                stmt += ')'
                return stmt
            },
            snCheckResult(snCheckResults: string[] | string): string {
                return queryBuilderHelper.jsonWhereStatement('eventoutput.eventoutputdata', 'snCheckResult', Operators.IN, snCheckResults)
            },
        }

        const queryBuilder = await createQueryBuilder(Event, 'event')
            .innerJoinAndSelect('event.eventInputs', 'eventinput')
            .innerJoinAndSelect('event.eventOutputs', 'eventoutput')

        for (let [filterName, filterValue] of Object.entries(eventSearchQuery)) {
            const whereFilter = whereFunctions[filterName]
            if (!!whereFilter) {
                queryBuilder.andWhere(whereFilter(filterValue))
            }
        }

        const count = await queryBuilder.getCount()
        queryBuilder.take(eventSearchQuery.limit)
        queryBuilder.skip(eventSearchQuery.page * eventSearchQuery.limit)

        const eventCollection = await queryBuilder.getMany()

        return {count, eventCollection, query: eventSearchQuery}
    }
}
