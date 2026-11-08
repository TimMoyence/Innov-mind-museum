export interface TextLimit {
    readonly min?: number;
    readonly max: number;
}
export declare const TEXT_LIMITS: {
    readonly password: {
        readonly min: 8;
        readonly max: 128;
    };
    readonly personName: {
        readonly max: 100;
    };
    readonly museumName: {
        readonly min: 1;
        readonly max: 200;
    };
    readonly museumSlug: {
        readonly min: 1;
        readonly max: 128;
    };
    readonly museumAddress: {
        readonly max: 500;
    };
    readonly museumDescription: {
        readonly max: 2000;
    };
    readonly contactName: {
        readonly min: 1;
        readonly max: 120;
    };
    readonly contactMessage: {
        readonly min: 10;
        readonly max: 5000;
    };
    readonly leadMuseum: {
        readonly min: 1;
        readonly max: 200;
    };
    readonly ticketSubject: {
        readonly min: 3;
        readonly max: 200;
    };
    readonly ticketDescription: {
        readonly min: 10;
        readonly max: 5000;
    };
    readonly ticketCategory: {
        readonly max: 64;
    };
    readonly ticketMessage: {
        readonly min: 1;
        readonly max: 2000;
    };
    readonly reviewComment: {
        readonly min: 10;
        readonly max: 2000;
    };
    readonly reviewerNotes: {
        readonly max: 2000;
    };
};
export declare function charCount(value: string): number;
export declare function isWithinLimit(value: string, { min, max }: TextLimit): boolean;
export declare function describeLimit(field: string, { min, max }: TextLimit): string;
export declare function clampChars(value: string, max: number): string;
